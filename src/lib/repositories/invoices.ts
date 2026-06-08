import { createClient } from '@/lib/supabase/server';
import type { Invoice, InvoiceStatus } from '@/types/database';
import type { LogContext } from '@/lib/observability';

const INVOICE_SELECT = '*, contract:contracts(*), unit:units(*, location:locations(*)), tenant:tenants(*)';

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
      .select('*, contract:contracts(*), unit:units(*, location:locations(*)), tenant:tenants(*), payments(*)')
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

  async create(input: Omit<Invoice, 'id' | 'created_at' | 'updated_at' | 'unit' | 'tenant' | 'payments'>, ctx: LogContext): Promise<Invoice> {
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

  async findDueThisMonth(ctx: LogContext): Promise<Invoice[]> {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .lte('due_date', end)
      .eq('status', 'due')
      .order('due_date');
    if (error) throw error;
    return data ?? [];
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

  async deleteFutureDueByContractId(contractId: string, afterDate: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('contract_id', contractId)
      .eq('status', 'due')
      .eq('paid_amount', 0)
      .gt('due_date', afterDate);
    if (error) throw error;
  },

  async findCurrentDueByContractId(contractId: string, date: string, ctx: LogContext): Promise<Invoice | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('contract_id', contractId)
      .eq('status', 'due')
      .eq('paid_amount', 0)
      .lte('period_start', date)
      .gte('period_end', date)
      .maybeSingle();
    if (error) throw error;
    return data;
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
