import { createClient } from '@/lib/supabase/server';
import type { Location } from '@/types/database';
import { logger } from '@/lib/observability';
import type { LogContext } from '@/lib/observability';

export const locationsRepository = {
  async findAll(ctx: LogContext): Promise<Location[]> {
    logger.debug('Finding all locations', { ...ctx, repository: 'locations', operation: 'findAll' });
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name_en');
    if (error) throw error;
    return data ?? [];
  },

  async findById(id: string, ctx: LogContext): Promise<Location | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('locations').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(input: {
    name_en: string;
    name_ar: string;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    odoo_analytic_account_id?: number | null;
    odoo_analytic_account_name?: string | null;
  }, ctx: LogContext): Promise<Location> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('locations').insert({
      name_en: input.name_en,
      name_ar: input.name_ar,
      address: input.address ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      odoo_analytic_account_id: input.odoo_analytic_account_id ?? null,
      odoo_analytic_account_name: input.odoo_analytic_account_name ?? null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, input: {
    name_en?: string;
    name_ar?: string;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    odoo_analytic_account_id?: number | null;
    odoo_analytic_account_name?: string | null;
  }, ctx: LogContext): Promise<Location> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('locations').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) throw error;
  },

  async countUnits(locationId: string, ctx: LogContext): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('units')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', locationId);
    if (error) throw error;
    return count ?? 0;
  },
};
