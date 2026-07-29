import { createClient } from '@/lib/supabase/server';
import type {
  OdooImportItem,
  OdooImportItemStatus,
  OdooImportRun,
  OdooImportRunStatus,
  OdooInvoiceDocument,
  OdooOutboxItem,
} from '@/types/database';
import type { LogContext } from '@/lib/observability';

const DOCUMENT_SELECT = `
  *,
  tenant:tenants(*),
  lines:odoo_invoice_lines(
    *,
    unit:units(*, location:locations(*)),
    contract:contracts(*)
  ),
  payments:odoo_invoice_payments(*)
`;

function isMissingImportSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === 'PGRST205'
    || candidate.code === '42P01'
    || String(candidate.message ?? '').includes('odoo_import_')
    || String(candidate.message ?? '').includes('odoo_invoice_documents');
}

function migrationRequired(error: unknown): never {
  if (isMissingImportSchema(error)) {
    throw new Error('Odoo import database migration is not applied. Apply the latest Supabase migrations first.');
  }
  throw error;
}

export const odooImportRepository = {
  async createRun(input: {
    import_type: OdooImportRun['import_type'];
    requested_by: string | null;
    cursor?: Record<string, unknown>;
  }, ctx: LogContext): Promise<OdooImportRun> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_import_runs')
      .insert({
        import_type: input.import_type,
        requested_by: input.requested_by,
        cursor: input.cursor ?? {},
      })
      .select('*')
      .single();
    if (error) migrationRequired(error);
    return data;
  },

  async updateRun(
    id: string,
    input: Partial<Pick<OdooImportRun, 'cursor' | 'summary' | 'error' | 'completed_at'>> & {
      status?: OdooImportRunStatus;
    },
    ctx: LogContext,
  ): Promise<OdooImportRun> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_import_runs')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async findRun(id: string, ctx: LogContext): Promise<OdooImportRun | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_import_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertItems(
    rows: Array<{
      run_id: string;
      item_type: OdooImportItem['item_type'];
      odoo_model: string;
      odoo_record_id: number;
      status: OdooImportItemStatus;
      payload: Record<string, unknown>;
      mapping: Record<string, unknown>;
      errors: string[];
    }>,
    ctx: LogContext,
  ): Promise<OdooImportItem[]> {
    if (rows.length === 0) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_import_items')
      .upsert(rows, { onConflict: 'run_id,odoo_model,odoo_record_id' })
      .select('*');
    if (error) throw error;
    return data ?? [];
  },

  async findItems(runId: string, ctx: LogContext): Promise<OdooImportItem[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_import_items')
      .select('*')
      .eq('run_id', runId)
      .order('odoo_record_id', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findItemsByIds(runId: string, ids: string[], ctx: LogContext): Promise<OdooImportItem[]> {
    if (ids.length === 0) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_import_items')
      .select('*')
      .eq('run_id', runId)
      .in('id', ids);
    if (error) throw error;
    return data ?? [];
  },

  async updateItem(
    id: string,
    input: {
      status?: OdooImportItemStatus;
      mapping?: Record<string, unknown>;
      errors?: string[];
      imported_at?: string | null;
    },
    ctx: LogContext,
  ): Promise<OdooImportItem> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_import_items')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async upsertDocumentAtomic(input: {
    document: Record<string, unknown>;
    lines: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    importItemId?: string | null;
  }, ctx: LogContext): Promise<OdooInvoiceDocument> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('upsert_odoo_invoice_document_atomic', {
      p_document: input.document,
      p_lines: input.lines,
      p_payments: input.payments,
      p_import_item_id: input.importItemId ?? null,
    });
    if (error) throw error;
    if (!data) throw new Error('Odoo invoice document was not saved');
    return data as OdooInvoiceDocument;
  },

  async mapContractGroupAtomic(
    contract: Record<string, unknown>,
    odooLineIds: number[],
    ctx: LogContext,
    lines?: Array<Record<string, unknown>>,
  ) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('map_odoo_contract_group_atomic', {
      p_contract: contract,
      p_odoo_line_ids: odooLineIds,
      p_lines: lines ?? null,
    });
    if (error) throw error;
    return data;
  },

  async findDocuments(filters: {
    odooInvoiceIds?: number[];
    unitId?: string;
    contractId?: string;
    locationId?: string;
  }, ctx: LogContext): Promise<OdooInvoiceDocument[]> {
    const supabase = await createClient();
    let query = supabase
      .from('odoo_invoice_documents')
      .select(DOCUMENT_SELECT)
      .order('invoice_date', { ascending: false });
    if (filters.odooInvoiceIds?.length) query = query.in('odoo_invoice_id', filters.odooInvoiceIds);
    const { data, error } = await query;
    if (isMissingImportSchema(error)) return [];
    if (error) throw error;
    let documents = (data ?? []) as OdooInvoiceDocument[];
    if (filters.unitId) {
      documents = documents.filter((document) => document.lines?.some((line) => line.unit_id === filters.unitId));
    }
    if (filters.contractId) {
      documents = documents.filter((document) => document.lines?.some((line) => line.contract_id === filters.contractId));
    }
    if (filters.locationId) {
      documents = documents.filter((document) => document.lines?.some((line) => (
        line.unit?.location_id === filters.locationId
      )));
    }
    return documents;
  },

  async findLatestDocumentWriteDate(ctx: LogContext): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_invoice_documents')
      .select('odoo_write_date')
      .not('odoo_write_date', 'is', null)
      .order('odoo_write_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isMissingImportSchema(error)) return null;
    if (error) throw error;
    return data?.odoo_write_date ?? null;
  },

  async enqueueOutbox(input: {
    operation: string;
    entity_type: string;
    entity_id: string | null;
    idempotency_key: string;
    payload?: Record<string, unknown>;
    created_by: string;
  }, ctx: LogContext): Promise<OdooOutboxItem> {
    const supabase = await createClient();
    const existing = await supabase
      .from('odoo_outbox')
      .select('*')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();
    if (existing.error) throw existing.error;

    // Do not reopen succeeded items. Re-queue only pending/failed/processing.
    if (existing.data?.status === 'succeeded') {
      return existing.data as OdooOutboxItem;
    }

    if (existing.data) {
      const { data, error } = await supabase
        .from('odoo_outbox')
        .update({
          payload: input.payload ?? {},
          status: 'pending',
          available_at: new Date().toISOString(),
          last_error: null,
          processed_at: null,
        })
        .eq('id', existing.data.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('odoo_outbox')
      .insert({
        ...input,
        payload: input.payload ?? {},
        status: 'pending',
        available_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async findReadyOutbox(limit: number, ctx: LogContext): Promise<OdooOutboxItem[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('claim_odoo_outbox_batch', {
      p_limit: Math.min(Math.max(limit, 1), 50),
    });
    if (error) throw error;
    return (data ?? []) as OdooOutboxItem[];
  },

  async updateOutbox(
    id: string,
    input: Partial<Pick<OdooOutboxItem, 'status' | 'attempts' | 'last_error' | 'available_at' | 'processed_at'>>,
    ctx: LogContext,
  ): Promise<OdooOutboxItem> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_outbox')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },
};
