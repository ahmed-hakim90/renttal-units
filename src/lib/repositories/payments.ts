import { createClient } from '@/lib/supabase/server';
import type { Payment, PaymentMethod } from '@/types/database';
import type { LogContext } from '@/lib/observability';
import {
  DEFAULT_LIST_PAGE_SIZE,
  listPageRange,
  MAX_UNBOUNDED_LIST_ROWS,
  toListPageResult,
  type ListPageResult,
} from '@/lib/pagination/list-page';

export const paymentsRepository = {
  async findAll(ctx: LogContext, filters?: { invoiceId?: string }): Promise<Payment[]> {
    const supabase = await createClient();
    let query = supabase
      .from('payments')
      .select('*, invoice:invoices(*, unit:units(*, location:locations(*)))')
      .order('payment_date', { ascending: false })
      .limit(MAX_UNBOUNDED_LIST_ROWS);
    if (filters?.invoiceId) query = query.eq('invoice_id', filters.invoiceId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async findPage(
    ctx: LogContext,
    filters?: { invoiceId?: string; page?: number; pageSize?: number },
  ): Promise<ListPageResult<Payment>> {
    const { page, pageSize, from, to } = listPageRange(
      filters?.page ?? 1,
      filters?.pageSize ?? DEFAULT_LIST_PAGE_SIZE,
    );
    const supabase = await createClient();
    let query = supabase
      .from('payments')
      .select('*, invoice:invoices(*, unit:units(*, location:locations(*)))', { count: 'exact' })
      .order('payment_date', { ascending: false })
      .range(from, to);
    if (filters?.invoiceId) query = query.eq('invoice_id', filters.invoiceId);
    const { data, error, count } = await query;
    if (error) throw error;
    return toListPageResult(data ?? [], count, page, pageSize);
  },

  async findById(id: string, ctx: LogContext): Promise<Payment | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payments')
      .select('*, invoice:invoices(*)')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(input: Omit<Payment, 'id' | 'created_at' | 'invoice'>, ctx: LogContext): Promise<Payment> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('payments').insert(input).select('*, invoice:invoices(*)').single();
    if (error) throw error;
    return data;
  },

  async recordAtomic(input: {
    invoice_id: string;
    amount: number;
    payment_date: string;
    payment_method: PaymentMethod;
    reference_number?: string | null;
    notes?: string | null;
    created_by: string;
  }, ctx: LogContext): Promise<Payment> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('record_payment_atomic', {
      p_invoice_id: input.invoice_id,
      p_amount: input.amount,
      p_payment_date: input.payment_date,
      p_payment_method: input.payment_method,
      p_reference_number: input.reference_number ?? null,
      p_notes: input.notes ?? null,
      p_created_by: input.created_by,
    });
    if (error) throw error;
    if (!data) throw new Error('Payment was not recorded');
    return data as Payment;
  },

  async sumByInvoice(invoiceId: string, ctx: LogContext): Promise<number> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('payments').select('amount').eq('invoice_id', invoiceId);
    if (error) throw error;
    return (data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  },
};
