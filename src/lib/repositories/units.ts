import { createClient } from '@/lib/supabase/server';
import type { Contract, Unit, PaymentCycle, UnitStatus } from '@/types/database';
import type { LogContext } from '@/lib/observability';

const UNIT_SELECT = '*, location:locations(*), tenant:tenants(*), active_contract:contracts!contracts_unit_id_fkey(*)';

type UnitRow = Unit & { active_contract?: Contract | Contract[] | null };

function normalizeUnit(row: UnitRow): Unit {
  return {
    ...row,
    active_contract: Array.isArray(row.active_contract)
      ? row.active_contract.find((contract: Contract) => contract.status === 'active') ?? null
      : row.active_contract ?? null,
  };
}

export const unitsRepository = {
  async findAll(ctx: LogContext, filters?: { locationId?: string; status?: string }): Promise<Unit[]> {
    const supabase = await createClient();
    let query = supabase
      .from('units')
      .select(UNIT_SELECT)
      .order('unit_number');
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    if (filters?.status) query = query.eq('status', filters.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((unit) => normalizeUnit(unit as UnitRow));
  },

  async findById(id: string, ctx: LogContext): Promise<Unit | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('units')
      .select(UNIT_SELECT)
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return data;
    return normalizeUnit(data as UnitRow);
  },

  async findByUnitNumber(unitNumber: string, ctx: LogContext): Promise<Unit | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('units')
      .select(UNIT_SELECT)
      .eq('unit_number', unitNumber)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return normalizeUnit(data as UnitRow);
  },

  async create(input: {
    location_id: string;
    unit_number: string;
    floor?: string | null;
    area_sqm?: number | null;
    monthly_rent?: number | null;
    payment_cycle?: PaymentCycle;
    rent_start_date?: string | null;
    rent_end_date?: string | null;
    status: UnitStatus;
    tenant_id?: string | null;
  }, ctx: LogContext): Promise<Unit> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('units').insert({
      ...input,
      floor: input.floor ?? null,
      area_sqm: input.area_sqm ?? null,
      monthly_rent: input.monthly_rent ?? null,
      payment_cycle: input.payment_cycle ?? 'monthly',
      rent_start_date: input.rent_start_date ?? null,
      rent_end_date: input.rent_end_date ?? null,
      tenant_id: input.tenant_id ?? null,
    }).select(UNIT_SELECT).single();
    if (error) throw error;
    return data;
  },

  async update(id: string, input: Partial<Unit>, ctx: LogContext): Promise<Unit> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('units').update(input).eq('id', id).select(UNIT_SELECT).single();
    if (error) throw error;
    return data;
  },

  async delete(id: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('units').delete().eq('id', id);
    if (error) throw error;
  },

  async bulkCreate(units: Array<Omit<Unit, 'id' | 'created_at' | 'updated_at' | 'location' | 'tenant'>>, ctx: LogContext): Promise<Unit[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('units').insert(units).select();
    if (error) throw error;
    return data ?? [];
  },
};
