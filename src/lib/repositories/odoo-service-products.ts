import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { LogContext } from '@/lib/observability';
import type { OdooServiceProduct } from '@/types/database';

const SERVICE_PRODUCT_SELECT = [
  'odoo_product_id',
  'name',
  'display_name',
  'default_code',
  'description',
  'category_id',
  'category_name',
  'active',
  'last_synced_at',
  'created_at',
  'updated_at',
].join(',');

type ServiceProductSyncInput = {
  id: number;
  name: string;
  display_name: string;
  default_code: string | null;
  description: string | null;
  category_name: string | null;
};

function isMissingCatalogTable(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'PGRST205'
  );
}

export const odooServiceProductsRepository = {
  async findActive(_ctx: LogContext): Promise<OdooServiceProduct[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_service_products')
      .select(SERVICE_PRODUCT_SELECT)
      .eq('active', true)
      .order('display_name')
      .order('odoo_product_id');

    // Keep contract entry operational while a deployment is rolling out the migration.
    if (isMissingCatalogTable(error)) return [];
    if (error) throw error;
    return (data ?? []) as unknown as OdooServiceProduct[];
  },

  async syncCategory(
    categoryId: number,
    products: ServiceProductSyncInput[],
    syncedAt: string,
    _ctx: LogContext,
  ): Promise<number> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('sync_odoo_service_product_catalog', {
      p_category_id: categoryId,
      p_products: products,
      p_synced_at: syncedAt,
    });
    if (error) throw error;
    return typeof data === 'number' ? data : products.length;
  },
};
