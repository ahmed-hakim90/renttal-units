import { createClient } from '@/lib/supabase/server';
import type { Invoice, InvoiceStatus, OdooSyncStatus } from '@/types/database';
import type { LogContext } from '@/lib/observability';
import { getDashboardDueDateRange } from '@/lib/rental/dashboard-due-buckets';

const INVOICE_SELECT = '*, contract:contracts(*), unit:units(*, location:locations(*)), tenant:tenants(*), lines:invoice_lines(*)';

function filterInvoicesByLocation<T extends { unit?: { location_id?: string | null } | null }>(
  invoices: T[],
  locationId?: string,
): T[] {
  if (!locationId) return invoices;
  return invoices.filter((invoice) => invoice.unit?.location_id === locationId);
}

export const invoicesRepository = {
  async findAll(ctx: LogContext, filters?: { status?: InvoiceStatus | InvoiceStatus[]; locationId?: string }): Promise<Invoice[]> {
    const supabase = await createClient();
    let query = supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .order('due_date', { ascending: false });
    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      query = query.in('status', statuses);
    }
    const { data, error } = await query;
    if (error) throw error;
    return filterInvoicesByLocation(data ?? [], filters?.locationId);
  },

  async findById(id: string, ctx: LogContext): Promise<Invoice | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*, contract:contracts(*), unit:units(*, location:locations(*)), tenant:tenants(*), payments(*), lines:invoice_lines(*)')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByInvoiceNumber(number: string, ctx: LogContext): Promise<Invoice | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('invoices').select('*').eq('invoice_number', number).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findByOdooInvoiceId(odooInvoiceId: number, ctx: LogContext): Promise<Invoice | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('odoo_invoice_id', odooInvoiceId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findLinkedForOdooSync(ctx: LogContext, limit = 250): Promise<Invoice[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .not('odoo_invoice_id', 'is', null)
      .in('odoo_invoice_state', ['draft', 'posted'])
      .order('updated_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (error) throw error;
    return data ?? [];
  },

  async syncFromOdoo(input: {
    odooInvoiceId: number;
    invoiceName: string | null;
    moveState: string;
    paymentState: string | null;
    amountTotal: number;
    amountResidual: number;
  }, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('sync_local_invoice_from_odoo', {
      p_odoo_invoice_id: input.odooInvoiceId,
      p_invoice_name: input.invoiceName,
      p_move_state: input.moveState,
      p_payment_state: input.paymentState,
      p_amount_total: input.amountTotal,
      p_amount_residual: input.amountResidual,
    });
    if (error) throw error;
    if (!data) throw new Error('Odoo invoice state was not synchronized');
    return data as Invoice;
  },

  async findByUnitAndPeriod(unitId: string, periodStart: string, periodEnd: string, ctx: LogContext, contractId?: string): Promise<Invoice | null> {
    const supabase = await createClient();
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('unit_id', unitId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd);
    if (contractId) query = query.eq('contract_id', contractId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: {
    invoice_number?: string;
    contract_id: string | null;
    unit_id: string;
    tenant_id: string | null;
    period_start: string;
    period_end: string;
    amount_untaxed?: number;
    amount_tax?: number;
    amount_total?: number;
    amount: number;
    paid_amount: number;
    status: InvoiceStatus;
    due_date: string;
    issued_at: string | null;
    notes: string | null;
    odoo_invoice_id?: number | null;
    odoo_invoice_name?: string | null;
    odoo_invoice_state?: string | null;
    odoo_sync_status?: OdooSyncStatus;
    odoo_sync_error?: string | null;
  }, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('invoices').insert(input).select(INVOICE_SELECT).single();
    if (error) throw error;
    return data;
  },

  async createLines(
    invoiceId: string,
    lines: Array<{
      contract_line_id?: string | null;
      line_type: 'rental' | 'service';
      unit_id?: string | null;
      description: string;
      odoo_product_id?: number | null;
      odoo_product_name?: string | null;
      quantity?: number;
      amount_untaxed: number;
      tax_rate: number;
      tax_treatment?: 'standard' | 'zero_rated';
      amount_tax: number;
      amount_total: number;
      period_start: string;
      period_end: string;
      sort_order: number;
    }>,
    ctx: LogContext,
  ): Promise<void> {
    if (lines.length === 0) return;
    const supabase = await createClient();
    const { error } = await supabase.from('invoice_lines').insert(
      lines.map((line) => ({
        invoice_id: invoiceId,
        contract_line_id: line.contract_line_id ?? null,
        line_type: line.line_type,
        unit_id: line.unit_id ?? null,
        description: line.description,
        odoo_product_id: line.odoo_product_id ?? null,
        odoo_product_name: line.odoo_product_name ?? null,
        quantity: line.quantity ?? 1,
        amount_untaxed: line.amount_untaxed,
        tax_rate: line.tax_rate,
        tax_treatment: line.tax_treatment ?? 'standard',
        amount_tax: line.amount_tax,
        amount_total: line.amount_total,
        period_start: line.period_start,
        period_end: line.period_end,
        sort_order: line.sort_order,
      })),
    );
    if (error) throw error;
  },

  async update(id: string, input: Partial<Invoice>, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('invoices').update(input).eq('id', id).select(INVOICE_SELECT).single();
    if (error) throw error;
    return data;
  },

  async issueDueInvoice(id: string, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('issue_due_invoice_atomic', {
      p_invoice_id: id,
    });
    if (error) throw error;
    if (!data) throw new Error('Invoice was not issued');
    return data as Invoice;
  },

  async countByStatus(
    status: InvoiceStatus | InvoiceStatus[],
    ctx: LogContext,
    filters?: { locationId?: string },
  ): Promise<number> {
    const supabase = await createClient();
    const statuses = Array.isArray(status) ? status : [status];
    if (!filters?.locationId) {
      const { count, error } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .in('status', statuses);
      if (error) throw error;
      return count ?? 0;
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('id, unit:units!inner(location_id)')
      .in('status', statuses)
      .eq('unit.location_id', filters.locationId);
    if (error) throw error;
    return data?.length ?? 0;
  },

  async findDueThisMonth(
    ctx: LogContext,
    alertWindowDays = 3,
    filters?: { locationId?: string },
  ): Promise<Invoice[]> {
    const end = new Date(Date.now() + alertWindowDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .gte('due_date', '2000-01-01')
      .lte('due_date', end)
      .eq('status', 'due')
      .order('due_date');
    if (error) throw error;
    return filterInvoicesByLocation(data ?? [], filters?.locationId);
  },

  async countDueThisMonth(
    ctx: LogContext,
    alertWindowDays = 3,
    filters?: { locationId?: string },
  ): Promise<number> {
    const invoices = await this.findDueThisMonth(ctx, alertWindowDays, filters);
    return invoices.length;
  },

  async findUpcomingStats(
    days: number,
    ctx: LogContext,
    filters?: { locationId?: string },
  ): Promise<{ count: number; amount: number }> {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('amount, paid_amount, unit:units(location_id)')
      .gte('due_date', today)
      .lte('due_date', future)
      .in('status', ['invoice_issued', 'partially_paid']);
    if (error) throw error;
    const rows = (data ?? []).filter((row) => {
      if (!filters?.locationId) return true;
      const unit = Array.isArray(row.unit) ? row.unit[0] : row.unit;
      return unit?.location_id === filters.locationId;
    });
    return {
      count: rows.length,
      amount: rows.reduce((sum, r) => sum + Number(r.amount) - Number(r.paid_amount), 0),
    };
  },

  async findScheduledDueWithin(
    days: number,
    ctx: LogContext,
    filters?: { locationId?: string },
  ): Promise<Array<{ due_date: string; amount: number; paid_amount: number }>> {
    const { startDate, endDate } = getDashboardDueDateRange(days);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('due_date, amount, paid_amount, unit:units(location_id)')
      .eq('status', 'due')
      .gte('due_date', startDate)
      .lte('due_date', endDate)
      .order('due_date');
    if (error) throw error;

    return (data ?? [])
      .filter((row) => {
        if (!filters?.locationId) return true;
        const unit = Array.isArray(row.unit) ? row.unit[0] : row.unit;
        return unit?.location_id === filters.locationId;
      })
      .map((row) => ({
        due_date: row.due_date,
        amount: Number(row.amount),
        paid_amount: Number(row.paid_amount),
      }));
  },

  async findOverdue(ctx: LogContext, filters?: { locationId?: string }): Promise<Invoice[]> {
    const today = new Date().toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .lt('due_date', today)
      .in('status', ['invoice_issued', 'partially_paid', 'overdue'])
      .order('due_date');
    if (error) throw error;
    return filterInvoicesByLocation(data ?? [], filters?.locationId);
  },

  async countOverdue(ctx: LogContext, filters?: { locationId?: string }): Promise<number> {
    if (filters?.locationId) {
      const overdue = await this.findOverdue(ctx, filters);
      return overdue.length;
    }

    const today = new Date().toISOString().split('T')[0];
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', today)
      .in('status', ['invoice_issued', 'partially_paid', 'overdue']);
    if (error) throw error;
    return count ?? 0;
  },

  async countByOdooSyncStatus(
    statuses: Array<'failed' | 'needs_review'>,
    ctx: LogContext,
  ): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .in('odoo_sync_status', statuses);
    if (error) throw error;
    return count ?? 0;
  },

  async findByUnitId(unitId: string, ctx: LogContext): Promise<Invoice[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('unit_id', unitId);
    if (error) throw error;
    return data ?? [];
  },

  async findByContractId(contractId: string, ctx: LogContext): Promise<Invoice[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('contract_id', contractId);
    if (error) throw error;
    return data ?? [];
  },

  async deleteAllDueByContractId(contractId: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('contract_id', contractId)
      .eq('status', 'due')
      .eq('paid_amount', 0);
    if (error) throw error;
  },

  async deleteDueOutsideContractBounds(
    contractId: string,
    startDate: string,
    endDate: string,
    ctx: LogContext,
  ): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('contract_id', contractId)
      .eq('status', 'due')
      .eq('paid_amount', 0)
      .or(`period_start.lt.${startDate},period_end.gt.${endDate}`);
    if (error) throw error;
  },

  async deleteDueByUnitId(unitId: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('unit_id', unitId)
      .eq('status', 'due')
      .eq('paid_amount', 0);
    if (error) throw error;
  },

  async findOutstanding(ctx: LogContext, filters?: { locationId?: string }): Promise<Invoice[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .in('status', ['due', 'invoice_issued', 'partially_paid', 'overdue'])
      .order('due_date');
    if (error) throw error;
    return filterInvoicesByLocation(
      (data ?? []).filter((inv) => Number(inv.amount) - Number(inv.paid_amount) > 0),
      filters?.locationId,
    );
  },
};
