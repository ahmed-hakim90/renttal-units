'use server';

import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { locationsRepository } from '@/lib/repositories/locations';
import { unitsRepository } from '@/lib/repositories/units';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { revalidatePath } from 'next/cache';
import { requireFeatureEnabled } from '@/lib/features/load-feature-flags';

type LocationInput = {
  name_en: string;
  name_ar: string;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  odoo_analytic_account_id?: number | null;
  odoo_analytic_account_name?: string | null;
};

function getLocationActionError(error: unknown) {
  if (error && typeof error === 'object') {
    const maybeError = error as { code?: unknown; message?: unknown };
    const message = typeof maybeError.message === 'string' ? maybeError.message : '';
    if (maybeError.code === '42703' || message.includes('odoo_analytic_account')) {
      return 'locationOdooAnalyticsMigrationMissing';
    }
    return message || 'Location save failed';
  }
  return error instanceof Error ? error.message : 'Location save failed';
}

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

export async function getLocations(locale: string) {
  const auth = await requirePermission(locale, 'locations.view', await getCtx());
  return locationsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function getLocationDetail(locale: string, id: string) {
  const auth = await requirePermission(locale, 'locations.view', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const location = await locationsRepository.findById(id, ctx);
  if (!location) return null;

  const units = await unitsRepository.findAll(ctx, { locationId: id });
  return { location, units };
}

export async function createLocation(locale: string, data: LocationInput) {
  const auth = await requirePermission(locale, 'locations.create', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;
  const validation = validationService.validateLocation(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(', ') };

  try {
    const location = await locationsRepository.create(data, ctx);
    await auditService.log(auth, 'create', 'location', location.id, null, location, ctx);
    revalidatePath(`/${locale}/locations`);
    return { success: true, data: location };
  } catch (error) {
    return { success: false, error: getLocationActionError(error) };
  }
}

export async function updateLocation(locale: string, id: string, data: Partial<LocationInput>) {
  const auth = await requirePermission(locale, 'locations.update', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;
  try {
    const old = await locationsRepository.findById(id, ctx);
    const location = await locationsRepository.update(id, data, ctx);
    await auditService.log(auth, 'update', 'location', id, old, location, ctx);
    revalidatePath(`/${locale}/locations`);
    return { success: true, data: location };
  } catch (error) {
    return { success: false, error: getLocationActionError(error) };
  }
}

export async function deleteLocation(locale: string, id: string) {
  const auth = await requirePermission(locale, 'locations.delete', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;
  const count = await locationsRepository.countUnits(id, ctx);
  if (count > 0) return { success: false, error: 'Location has units' };
  const old = await locationsRepository.findById(id, ctx);
  await locationsRepository.delete(id, ctx);
  await auditService.log(auth, 'delete', 'location', id, old, null, ctx);
  revalidatePath(`/${locale}/locations`);
  return { success: true };
}
