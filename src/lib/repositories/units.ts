import { createClient } from '@/lib/supabase/server';
import type { Contract, Unit, PaymentCycle, UnitStatus } from '@/types/database';
import type { LogContext } from '@/lib/observability';

const UNIT_SELECT = '*, location:locations(*), tenant:tenants(*), active_contract:contracts!contracts_unit_id_fkey(*)';

type UnitRow = Unit & { active_contract?: Contract | Contract[] | null };

function normalizeUnit(row: UnitRow, activeByUnitId?: Map<string, Contract>): Unit {
  const joinedActive = Array.isArray(row.active_contract)
    ? row.active_contract.find((contract: Contract) => contract.status === 'active') ?? null
    : row.active_contract?.status === 'active'
      ? row.active_contract
      : null;
  const activeContract = activeByUnitId?.get(row.id) ?? joinedActive;

  return {
    ...row,
    status: activeContract ? 'occupied' : row.status === 'maintenance' ? 'maintenance' : 'vacant',
    active_contract: activeContract,
  };
}

async function loadActiveContractsByUnitId(_ctx: LogContext): Promise<Map<string, Contract>> {
  const supabase = await createClient();
  const map = new Map<string, Contract>();

  // Prefer line-aware occupancy: any rental line on an active contract occupies that unit.
  const { data: activeContracts, error } = await supabase
    .from('contracts')
    .select('*, tenant:tenants(*), lines:contract_lines(unit_id, line_type)')
    .eq('status', 'active');

  if (error) throw error;

  for (const row of activeContracts ?? []) {
    const contract = row as Contract & {
      lines?: Array<{ unit_id: string | null; line_type: string }> | null;
    };
    if (contract.unit_id) {
      map.set(contract.unit_id, contract);
    }
    for (const line of contract.lines ?? []) {
      if (line.line_type === 'rental' && line.unit_id) {
        map.set(line.unit_id, contract);
      }
    }
  }

  return map;
}

export const unitsRepository = {
  async findAll(ctx: LogContext, filters?: { locationId?: string; status?: string }): Promise<Unit[]> {
    const supabase = await createClient();
    let query = supabase
      .from('units')
      .select(UNIT_SELECT)
      .order('unit_number');
    if (filters?.locationId) query = query.eq('location_id', filters.locationId);
    const { data, error } = await query;
    if (error) throw error;
    const activeByUnitId = await loadActiveContractsByUnitId(ctx);
    const units = (data ?? []).map((unit) => normalizeUnit(unit as UnitRow, activeByUnitId));
    if (filters?.status) return units.filter((unit) => unit.status === filters.status);
    return units;
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
    const activeByUnitId = await loadActiveContractsByUnitId(ctx);
    return normalizeUnit(data as UnitRow, activeByUnitId);
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
    const activeByUnitId = await loadActiveContractsByUnitId(ctx);
    return normalizeUnit(data as UnitRow, activeByUnitId);
  },

  async findByOdooProductId(productId: number, ctx: LogContext): Promise<Unit | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('units')
      .select(UNIT_SELECT)
      .eq('odoo_product_id', productId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const activeByUnitId = await loadActiveContractsByUnitId(ctx);
    return normalizeUnit(data as UnitRow, activeByUnitId);
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
    odoo_product_id?: number | null;
    odoo_product_reference?: string | null;
    odoo_product_name?: string | null;
    odoo_product_display_name?: string | null;
    odoo_product_description?: string | null;
    odoo_product_category_id?: number | null;
    odoo_product_category_name?: string | null;
    odoo_sync_status?: Unit['odoo_sync_status'];
    odoo_last_sync_at?: string | null;
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
      odoo_product_id: input.odoo_product_id ?? null,
      odoo_product_reference: input.odoo_product_reference ?? null,
      odoo_product_name: input.odoo_product_name ?? null,
      odoo_product_display_name: input.odoo_product_display_name ?? null,
      odoo_product_description: input.odoo_product_description ?? null,
      odoo_product_category_id: input.odoo_product_category_id ?? null,
      odoo_product_category_name: input.odoo_product_category_name ?? null,
      odoo_sync_status: input.odoo_sync_status ?? 'not_synced',
      odoo_last_sync_at: input.odoo_last_sync_at ?? null,
    }).select(UNIT_SELECT).single();
    if (error) throw error;
    return normalizeUnit(data as UnitRow);
  },

  async update(id: string, input: Partial<Unit>, ctx: LogContext): Promise<Unit> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('units').update(input).eq('id', id).select(UNIT_SELECT).single();
    if (error) throw error;
    return normalizeUnit(data as UnitRow);
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
