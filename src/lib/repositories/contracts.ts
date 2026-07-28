import { createClient } from '@/lib/supabase/server';
import type { Contract, ContractCancellationHandling, PaymentCycle } from '@/types/database';
import type { LogContext } from '@/lib/observability';

const CONTRACT_SELECT = '*, unit:units(*, location:locations(*)), tenant:tenants(*), invoices(*)';

export const contractsRepository = {
  async findAll(ctx: LogContext): Promise<Contract[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findById(id: string, ctx: LogContext): Promise<Contract | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findActiveByUnitId(unitId: string, ctx: LogContext): Promise<Contract | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('unit_id', unitId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findActive(ctx: LogContext): Promise<Contract[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('status', 'active');
    if (error) throw error;
    return data ?? [];
  },

  async getSummaryStats(ctx: LogContext): Promise<{
    totalCount: number;
    totalValue: number;
    activeCount: number;
  }> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('contracts').select('total_amount, status');
    if (error) throw error;
    const rows = data ?? [];
    return {
      totalCount: rows.length,
      totalValue: rows.reduce((sum, row) => sum + Number(row.total_amount), 0),
      activeCount: rows.filter((row) => row.status === 'active').length,
    };
  },

  async create(input: {
    unit_id: string;
    contract_number: string;
    tenant_id?: string | null;
    start_date: string;
    end_date: string;
    total_amount: number;
    payment_cycle: PaymentCycle;
    notes?: string | null;
  }, ctx: LogContext): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        ...input,
        notes: input.notes ?? null,
      })
      .select(CONTRACT_SELECT)
      .single();
    if (error) throw error;
    return data;
  },

  async cancel(
    id: string,
    input: {
      cancellation_date: string;
      cancellation_handling: ContractCancellationHandling;
    },
    ctx: LogContext
  ): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_date: input.cancellation_date,
        cancellation_handling: input.cancellation_handling,
      })
      .eq('id', id)
      .select(CONTRACT_SELECT)
      .single();
    if (error) throw error;
    return data;
  },

  async update(
    id: string,
    input: {
      contract_number?: string;
      tenant_id?: string | null;
      start_date?: string;
      end_date?: string;
      total_amount?: number;
      payment_cycle?: PaymentCycle;
      notes?: string | null;
      status?: 'active' | 'cancelled' | 'completed';
    },
    ctx: LogContext
  ): Promise<Contract> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .update(input)
      .eq('id', id)
      .select(CONTRACT_SELECT)
      .single();
    if (error) throw error;
    return data;
  },

  async markCompleted(ids: string[], ctx: LogContext): Promise<void> {
    if (ids.length === 0) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'completed' })
      .in('id', ids)
      .eq('status', 'active');
    if (error) throw error;
  },
};
