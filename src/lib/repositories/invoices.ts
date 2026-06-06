import { createClient } from '@/lib/supabase/server';
import type { Invoice, InvoiceStatus } from '@/types/database';
import type { LogContext } from '@/lib/observability';

export const invoicesRepository = {
  async findAll(ctx: LogContext, filters?: { status?: InvoiceStatus | InvoiceStatus[]; locationId?: string }): Promise<Invoice[]> {
    const supabase = await createClient();
    let query = supabase
      .from('invoices')
      .select('*, unit:units(*, location:locations(*)), tenant:tenants(*)')
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
      .select('*, unit:units(*, location:locations(*)), tenant:tenants(*), payments(*)')
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

  async findByUnitAndPeriod(unitId: string, periodStart: string, periodEnd: string, ctx: LogContext): Promise<Invoice | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('unit_id', unitId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: Omit<Invoice, 'id' | 'created_at' | 'updated_at' | 'unit' | 'tenant' | 'payments'>, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('invoices').insert(input).select('*, unit:units(*)').single();
    if (error) throw error;
    return data;
  },

  async update(id: string, input: Partial<Invoice>, ctx: LogContext): Promise<Invoice> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('invoices').update(input).eq('id', id).select('*, unit:units(*)').single();
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
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*, unit:units(*, location:locations(*)), tenant:tenants(*)')
      .gte('due_date', start)
      .lte('due_date', end)
      .eq('status', 'due')
      .order('due_date');
    if (error) throw error;
    return data ?? [];
  },

  async findOverdue(ctx: LogContext): Promise<Invoice[]> {
    const today = new Date().toISOString().split('T')[0];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*, unit:units(*, location:locations(*)), tenant:tenants(*)')
      .lt('due_date', today)
      .in('status', ['invoice_issued', 'partially_paid', 'overdue'])
      .order('due_date');
    if (error) throw error;
    return data ?? [];
  },

  async findOutstanding(ctx: LogContext): Promise<Invoice[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*, unit:units(*, location:locations(*)), tenant:tenants(*)')
      .in('status', ['due', 'invoice_issued', 'partially_paid', 'overdue'])
      .order('due_date');
    if (error) throw error;
    return (data ?? []).filter((inv) => Number(inv.amount) - Number(inv.paid_amount) > 0);
  },
};
