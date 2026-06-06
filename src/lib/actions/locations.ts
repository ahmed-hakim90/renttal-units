'use server';

import { requireAuth, requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { locationsRepository } from '@/lib/repositories/locations';
import { auditService } from '@/lib/services/audit-service';
import { validationService } from '@/lib/services/validation-service';
import { revalidatePath } from 'next/cache';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

export async function getLocations(locale: string) {
  const auth = await requireAuth(locale, await getCtx());
  return locationsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function createLocation(locale: string, data: { name_en: string; name_ar: string; address?: string; city?: string; region?: string }) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const validation = validationService.validateLocation(data);
  if (!validation.valid) return { success: false, error: validation.errors.join(', ') };

  const location = await locationsRepository.create(data, ctx);
  await auditService.log(auth, 'create', 'location', location.id, null, location, ctx);
  revalidatePath(`/${locale}/locations`);
  return { success: true, data: location };
}

export async function updateLocation(locale: string, id: string, data: Partial<{ name_en: string; name_ar: string; address?: string; city?: string; region?: string }>) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const old = await locationsRepository.findById(id, ctx);
  const location = await locationsRepository.update(id, data, ctx);
  await auditService.log(auth, 'update', 'location', id, old, location, ctx);
  revalidatePath(`/${locale}/locations`);
  return { success: true, data: location };
}

export async function deleteLocation(locale: string, id: string) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const count = await locationsRepository.countUnits(id, ctx);
  if (count > 0) return { success: false, error: 'Location has units' };
  const old = await locationsRepository.findById(id, ctx);
  await locationsRepository.delete(id, ctx);
  await auditService.log(auth, 'delete', 'location', id, old, null, ctx);
  revalidatePath(`/${locale}/locations`);
  return { success: true };
}
