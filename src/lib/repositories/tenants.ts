import { createClient } from '@/lib/supabase/server';
import type { Tenant } from '@/types/database';
import type { LogContext } from '@/lib/observability';

export const tenantsRepository = {
  async create(
    input: { full_name: string; phone?: string | null; email?: string | null },
    ctx: LogContext
  ): Promise<Tenant> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .insert({
        full_name: input.full_name,
        phone: input.phone ?? null,
        email: input.email ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },
};
