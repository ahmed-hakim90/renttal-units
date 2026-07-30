'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { odooService } from '@/lib/odoo/service';
import { odooServiceProductsRepository } from '@/lib/repositories/odoo-service-products';
import { requireFeatureEnabled } from '@/lib/features/load-feature-flags';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

/** Unit-page Odoo actions — kept separate from import-center actions to keep /units compile graph lean. */

export async function searchOdooProducts(
  locale: string,
  query: string,
  limit?: number,
  category: 'rental' | 'service' = 'rental',
) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  if (category === 'rental') {
    const disabled = await requireFeatureEnabled(ctx, 'units_link_odoo_product');
    if (disabled) return [];
  }
  return odooService.searchProducts(auth, query, ctx, limit, category);
}

export async function refreshOdooUnitCatalog(locale: string, limit?: number) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'units_odoo_catalog_button');
  if (disabled) return disabled;
  const products = await odooService.searchProducts(auth, '', ctx, limit);
  const sync = await odooService.syncLinkedUnitDetails(auth, products, ctx);
  revalidatePath(`/${locale}/units`);
  return { products, sync };
}

export async function syncOdooServiceProductCatalog(locale: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_service_catalog_button');
  if (disabled) return disabled;
  const result = await odooService.syncServiceProductCatalog(auth, ctx);
  if (!result.success) return result;

  const products = await odooServiceProductsRepository.findActive(ctx);
  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/contracts/new`);
  revalidatePath(`/${locale}/contracts`);
  return { ...result, products };
}

export async function linkUnitToOdooProduct(locale: string, unitId: string, productId: number) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'units_link_odoo_product');
  if (disabled) return disabled;
  const result = await odooService.linkUnitProduct(auth, unitId, productId, ctx);
  revalidatePath(`/${locale}/units`);
  return result;
}

export async function createOdooProductForUnit(locale: string, unitId: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'units_create_odoo_product');
  if (disabled) return disabled;
  const result = await odooService.createProductForUnit(auth, unitId, ctx);
  revalidatePath(`/${locale}/units`);
  return result;
}

export async function createUnitFromOdooProduct(locale: string, input: {
  locationId: string;
  productId: number;
}) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const linkDisabled = await requireFeatureEnabled(ctx, 'units_link_odoo_product');
  if (linkDisabled) return linkDisabled;
  const masterDisabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (masterDisabled) return masterDisabled;
  const result = await odooService.createUnitFromProduct(auth, input, ctx);
  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/locations/${input.locationId}`);
  return result;
}
