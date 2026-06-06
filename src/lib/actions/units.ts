'use server';

import { requireAuth, requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { unitsRepository } from '@/lib/repositories/units';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { contractsRepository } from '@/lib/repositories/contracts';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { revalidatePath } from 'next/cache';
import type { UnitStatus } from '@/types/database';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
  );
}

export async function getUnits(locale: string, filters?: { locationId?: string; status?: string }) {
  const auth = await requireAuth(locale, await getCtx());
  return unitsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role }, filters);
}

export async function createUnit(locale: string, data: {
  location_id: string;
  unit_number: string;
  floor?: string;
  area_sqm?: number;
  status: UnitStatus;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const validation = validationService.validateUnit(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(', ') };

  let unit;
  try {
    unit = await unitsRepository.create(data, ctx);
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
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const old = await unitsRepository.findById(id, ctx);
  if (!old) return { success: false, error: 'Unit not found' };

  const validation = validationService.validateUnit({
    location_id: data.location_id ?? old.location_id,
    unit_number: data.unit_number ?? old.unit_number,
    floor: data.floor ?? old.floor ?? undefined,
    area_sqm: data.area_sqm ?? old.area_sqm ?? undefined,
    status: data.status ?? old.status,
  });
  if (!validation.valid) return { success: false, error: validation.errors.join(', ') };

  const unit = await unitsRepository.update(id, data, ctx);
  await auditService.log(auth, 'update', 'unit', id, old, unit, ctx);
  revalidatePath(`/${locale}/units`);
  return { success: true, data: unit };
}

export async function deleteUnit(locale: string, id: string) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
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
