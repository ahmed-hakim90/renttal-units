import { createClient } from '@/lib/supabase/server';
import type { Tenant } from '@/types/database';
import type { LogContext } from '@/lib/observability';

export type TenantInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  odoo_partner_id?: number | null;
  vat?: string | null;
  street?: string | null;
  city?: string | null;
  country_code?: string | null;
};

const TENANTS_LIST_LIMIT = 500;

export const tenantsRepository = {
  async findAll(ctx: LogContext): Promise<Tenant[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('full_name')
      .limit(TENANTS_LIST_LIMIT);
    if (error) throw error;
    return data ?? [];
  },

  async findById(id: string, ctx: LogContext): Promise<Tenant | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findByOdooPartnerId(odooPartnerId: number, ctx: LogContext): Promise<Tenant | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('odoo_partner_id', odooPartnerId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async countLinkedContracts(tenantId: string, ctx: LogContext): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return count ?? 0;
  },

  async countLinkedInvoices(tenantId: string, ctx: LogContext): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return count ?? 0;
  },

  async create(input: TenantInput, ctx: LogContext): Promise<Tenant> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .insert({
        full_name: input.full_name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        national_id: input.national_id ?? null,
        odoo_partner_id: input.odoo_partner_id ?? null,
        vat: input.vat ?? null,
        street: input.street ?? null,
        city: input.city ?? null,
        country_code: input.country_code ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, input: Partial<TenantInput>, ctx: LogContext): Promise<Tenant> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('tenants').delete().eq('id', id);
    if (error) throw error;
  },
};
