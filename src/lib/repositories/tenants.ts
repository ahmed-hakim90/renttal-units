import { createClient } from '@/lib/supabase/server';
import type { Tenant } from '@/types/database';
import type { LogContext } from '@/lib/observability';

export type TenantInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
};

export const tenantsRepository = {
  async create(input: TenantInput, ctx: LogContext): Promise<Tenant> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .insert({
        full_name: input.full_name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        national_id: input.national_id ?? null,
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
