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

export const tenantsRepository = {
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
};
