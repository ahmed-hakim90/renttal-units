'use server';

import { requirePermission } from '@/lib/auth/session';
import { canMutateModule, hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { unitsRepository } from '@/lib/repositories/units';
import { locationsRepository } from '@/lib/repositories/locations';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { contractsRepository } from '@/lib/repositories/contracts';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { isUniqueViolation } from '@/lib/db/postgres-errors';
import { revalidatePath } from 'next/cache';
import type { UnitStatus } from '@/types/database';
import { loadFeatureFlags, requireFeatureEnabled } from '@/lib/features/load-feature-flags';
import { odooServiceProductsRepository } from '@/lib/repositories/odoo-service-products';
import { getPublicOdooSettings } from '@/lib/odoo/settings';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

function normalizeManualUnitStatus(status: UnitStatus | undefined): Extract<UnitStatus, 'vacant' | 'maintenance'> {
  return status === 'maintenance' ? 'maintenance' : 'vacant';
}

export async function getUnits(locale: string, filters?: { locationId?: string; status?: string }) {
  const auth = await requirePermission(locale, 'units.view', await getCtx());
  return unitsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role }, filters);
}

export async function getUnitsPageData(locale: string) {
  const auth = await requirePermission(locale, 'units.view', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const canManageOdoo = hasPermission(auth, 'odoo.manage');

  const [units, locations, featureFlags, odooSettings] = await Promise.all([
    unitsRepository.findAll(ctx),
    locationsRepository.findAll(ctx),
    loadFeatureFlags(ctx),
    getPublicOdooSettings(ctx).catch(() => null),
  ]);

  const showOdooServiceCatalogButton = canManageOdoo && featureFlags.odoo_service_catalog_button;
  let serviceProducts: Awaited<ReturnType<typeof odooServiceProductsRepository.findActive>> = [];
  if (showOdooServiceCatalogButton) {
    serviceProducts = await odooServiceProductsRepository.findActive(ctx).catch(() => []);
  }

  const serviceCategoryId = odooSettings?.serviceCategoryId ?? null;

  return {
    units,
    locations,
    canEdit: canMutateModule(auth, 'units') && featureFlags.master_data_mutations,
    showOdooCatalogButton: canManageOdoo && featureFlags.units_odoo_catalog_button,
    showOdooServiceCatalogButton,
    allowCreateOdooProduct: featureFlags.units_create_odoo_product,
    allowLinkOdooProduct: featureFlags.units_link_odoo_product,
    serviceProducts: serviceCategoryId == null
      ? serviceProducts
      : serviceProducts.filter((product) => product.category_id === serviceCategoryId),
    serviceCategoryId,
  };
}

export async function getUnitHistory(locale: string, unitId: string) {
  const auth = await requirePermission(locale, 'units.view', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const [unit, contracts, invoices] = await Promise.all([
    unitsRepository.findById(unitId, ctx),
    contractsRepository.findByUnitId(unitId, ctx),
    invoicesRepository.findByUnitId(unitId, ctx),
  ]);
  return { unit, contracts, invoices };
}

export async function createUnit(locale: string, data: {
  location_id: string;
  unit_number: string;
  floor?: string;
  area_sqm?: number;
  status: UnitStatus;
}) {
  const auth = await requirePermission(locale, 'units.create', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;
  const input = { ...data, status: normalizeManualUnitStatus(data.status) };
  const validation = validationService.validateUnit(input);
  if (!validation.valid) return { success: false, error: validation.errors.join(', ') };

  let unit;
  try {
    unit = await unitsRepository.create(input, ctx);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: 'duplicateUnit', errorCode: 'DUPLICATE_UNIT' };
    }
    throw error;
  }

  await auditService.log(auth, 'create', 'unit', unit.id, null, unit, ctx);
  revalidatePath(`/${locale}/units`);
  return { success: true, data: unit };
}

export async function updateUnit(locale: string, id: string, data: Partial<{
  location_id: string;
  unit_number: string;
  floor?: string;
  area_sqm?: number;
  status: UnitStatus;
}>) {
  const auth = await requirePermission(locale, 'units.update', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;
  const old = await unitsRepository.findById(id, ctx);
  if (!old) return { success: false, error: 'Unit not found' };
  if (
    old.odoo_product_id
    && data.unit_number !== undefined
    && data.unit_number.trim() !== old.unit_number
  ) {
    return { success: false, error: 'odooManagedUnitName', errorCode: 'VALIDATION_ERROR' };
  }
  const input = { ...data };
  if (data.status) input.status = normalizeManualUnitStatus(data.status);

  const validation = validationService.validateUnit({
    location_id: input.location_id ?? old.location_id,
    unit_number: input.unit_number ?? old.unit_number,
    floor: input.floor ?? old.floor ?? undefined,
    area_sqm: input.area_sqm ?? old.area_sqm ?? undefined,
    status: input.status ?? old.status,
  });
  if (!validation.valid) return { success: false, error: validation.errors.join(', ') };

  const unit = await unitsRepository.update(id, input, ctx);
  await auditService.log(auth, 'update', 'unit', id, old, unit, ctx);
  revalidatePath(`/${locale}/units`);
  return { success: true, data: unit };
}

export async function deleteUnit(locale: string, id: string) {
  const auth = await requirePermission(locale, 'units.delete', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;
  const old = await unitsRepository.findById(id, ctx);
  if (!old) return { success: false, error: 'Unit not found' };

  const activeContract = await contractsRepository.findActiveByUnitId(id, ctx);
  if (activeContract) {
    return { success: false, error: 'unitHasFinancialRecords', errorCode: 'CONFLICT' };
  }

  const invoices = await invoicesRepository.findByUnitId(id, ctx);
  const hasPayments = invoices.some((invoice) => Number(invoice.paid_amount) > 0);
  const hasNonDueInvoices = invoices.some((invoice) => invoice.status !== 'due');

  if (hasPayments || hasNonDueInvoices) {
    return { success: false, error: 'unitHasFinancialRecords', errorCode: 'CONFLICT' };
  }

  if (invoices.length > 0) {
    await invoicesRepository.deleteDueByUnitId(id, ctx);
  }

  await unitsRepository.delete(id, ctx);
  await auditService.log(auth, 'delete', 'unit', id, old, null, ctx);
  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/reports/debt-aging`);
  return { success: true };
}
