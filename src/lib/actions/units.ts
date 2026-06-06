'use server';

import { requireAuth, requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { unitsRepository } from '@/lib/repositories/units';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { revalidatePath } from 'next/cache';
import type { PaymentCycle, UnitStatus } from '@/types/database';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
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
  monthly_rent: number;
  payment_cycle: PaymentCycle;
  rent_start_date?: string | null;
  rent_end_date?: string | null;
  status: UnitStatus;
  tenant_id?: string | null;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const validation = validationService.validateUnit(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(', ') };

  const unit = await unitsRepository.create(data, ctx);
  await auditService.log(auth, 'create', 'unit', unit.id, null, unit, ctx);
  revalidatePath(`/${locale}/units`);
  return { success: true, data: unit };
}

export async function updateUnit(locale: string, id: string, data: Partial<{
  location_id: string;
  unit_number: string;
  floor?: string;
  area_sqm?: number;
  monthly_rent: number;
  payment_cycle: PaymentCycle;
  rent_start_date?: string | null;
  rent_end_date?: string | null;
  status: UnitStatus;
  tenant_id?: string | null;
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
    monthly_rent: data.monthly_rent ?? Number(old.monthly_rent),
    payment_cycle: data.payment_cycle ?? old.payment_cycle,
    rent_start_date: data.rent_start_date ?? old.rent_start_date,
    rent_end_date: data.rent_end_date ?? old.rent_end_date,
    status: data.status ?? old.status,
    tenant_id: data.tenant_id ?? old.tenant_id,
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
  await unitsRepository.delete(id, ctx);
  await auditService.log(auth, 'delete', 'unit', id, old, null, ctx);
  revalidatePath(`/${locale}/units`);
  return { success: true };
}
