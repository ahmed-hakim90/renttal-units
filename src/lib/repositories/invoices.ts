import { createClient } from '@/lib/supabase/server';
import type { Invoice, InvoiceStatus, OdooSyncStatus } from '@/types/database';
import type { LogContext } from '@/lib/observability';

const INVOICE_SELECT = '*, contract:contracts(*), unit:units(*, location:locations(*)), tenant:tenants(*), lines:invoice_lines(*)';

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
    let results = data ?? [];
    if (filters?.locationId) {
      results = results.filter((inv) => inv.unit?.location_id === filters.locationId);
    }
    return results;
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

  async update(id: string, input: Partial<Invoice>, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('invoices').update(input).eq('id', id).select(INVOICE_SELECT).single();
    if (error) throw error;
    return data;
  },

  async issueDueInvoice(id: string, invoiceNumber: string, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('issue_due_invoice_atomic', {
      p_invoice_id: id,
      p_invoice_number: invoiceNumber,
    });
    if (error) throw error;
    if (!data) throw new Error('Invoice was not issued');
    return data as Invoice;
  },

  async countByStatus(status: InvoiceStatus | InvoiceStatus[], ctx: LogContext): Promise<number> {
    const supabase = await createClient();
    const statuses = Array.isArray(status) ? status : [status];
    const { count, error } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .in('status', statuses);
    if (error) throw error;
    return count ?? 0;
  },

  async findDueThisMonth(ctx: LogContext, alertWindowDays = 3): Promise<Invoice[]> {
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
    return data ?? [];
  },

  async countDueThisMonth(ctx: LogContext, alertWindowDays = 3): Promise<number> {
    const end = new Date(Date.now() + alertWindowDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .gte('due_date', '2000-01-01')
      .lte('due_date', end)
      .eq('status', 'due');
    if (error) throw error;
    return count ?? 0;
  },

  async findUpcomingStats(days: number, ctx: LogContext): Promise<{ count: number; amount: number }> {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('amount, paid_amount')
      .gte('due_date', today)
      .lte('due_date', future)
      .in('status', ['invoice_issued', 'partially_paid']);
    if (error) throw error;
    const rows = data ?? [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, r) => sum + Number(r.amount) - Number(r.paid_amount), 0),
    };
  },

  async findOverdue(ctx: LogContext): Promise<Invoice[]> {
    const today = new Date().toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .lt('due_date', today)
      .in('status', ['invoice_issued', 'partially_paid', 'overdue'])
      .order('due_date');
    if (error) throw error;
    return data ?? [];
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

  async findOutstanding(ctx: LogContext): Promise<Invoice[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .in('status', ['due', 'invoice_issued', 'partially_paid', 'overdue'])
      .order('due_date');
    if (error) throw error;
    return (data ?? []).filter((inv) => Number(inv.amount) - Number(inv.paid_amount) > 0);
  },
};
