'use server';

import { requireAuth, requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { reportingService } from '@/lib/services/reporting-service';
import { usersRepository } from '@/lib/repositories/users';
import { settingsRepository } from '@/lib/repositories/settings';
import { auditService } from '@/lib/services/audit-service';
import { unitsRepository } from '@/lib/repositories/units';
import { locationsRepository } from '@/lib/repositories/locations';
import { importLogsRepository } from '@/lib/repositories/settings';
import { validationService } from '@/lib/services/validation-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { UserRole, PaymentCycle, UnitStatus } from '@/types/database';
import * as XLSX from 'xlsx';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

export async function getDebtAgingReport(locale: string, filters?: { locationId?: string }) {
  const auth = await requireAuth(locale, await getCtx());
  return reportingService.getDebtAgingReport(auth, { ...await getCtx(), user_id: auth.userId, role: auth.role }, filters);
}

export async function getPortfolioSummary(locale: string) {
  const auth = await requireAuth(locale, await getCtx());
  return reportingService.getPortfolioSummary(auth, { ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function getUsers(locale: string) {
  const auth = await requireAdminEditor(locale, await getCtx());
  return usersRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function createUser(locale: string, data: {
  full_name: string;
  email: string;
  temporary_password: string;
  role: UserRole;
}) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const fullName = data.full_name.trim();
  const email = data.email.trim().toLowerCase();
  const temporaryPassword = data.temporary_password;

  if (!fullName) return { success: false, error: 'Name is required' };
  if (!email) return { success: false, error: 'Email is required' };
  if (temporaryPassword.length < 8) return { success: false, error: 'Temporary password must be at least 8 characters' };
  if (!['admin_editor', 'viewer'].includes(data.role)) return { success: false, error: 'Invalid role' };

  const supabaseAdmin = createAdminClient();
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error || !created.user) {
    return { success: false, error: error?.message ?? 'Failed to create user' };
  }

  const profile = await usersRepository.upsertProfile({
    id: created.user.id,
    email,
    full_name: fullName,
    role: data.role,
  }, ctx);

  await auditService.log(
    auth,
    'create_user',
    'profile',
    profile.id,
    {
      old_role: null,
    },
    {
      created_by: auth.userId,
      target_user_id: profile.id,
      old_role: null,
      new_role: profile.role,
      timestamp: new Date().toISOString(),
    },
    ctx
  );

  revalidatePath(`/${locale}/users`);
  return { success: true, data: profile };
}

export async function updateUserRole(locale: string, userId: string, role: UserRole) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const old = await usersRepository.findById(userId, ctx);
  const profile = await usersRepository.updateRole(userId, role, ctx);
  await auditService.log(
    auth,
    'update_role',
    'profile',
    userId,
    {
      created_by: auth.userId,
      target_user_id: userId,
      old_role: old?.role ?? null,
      new_role: role,
      timestamp: new Date().toISOString(),
    },
    {
      created_by: auth.userId,
      target_user_id: userId,
      old_role: old?.role ?? null,
      new_role: profile.role,
      timestamp: new Date().toISOString(),
    },
    ctx
  );
  revalidatePath(`/${locale}/users`);
  return { success: true, data: profile };
}

export async function getSettings(locale: string) {
  const auth = await requireAuth(locale, await getCtx());
  return settingsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function updateSetting(locale: string, key: string, value: unknown) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const old = await settingsRepository.findByKey(key, ctx);
  const setting = await settingsRepository.upsert(key, value, auth.userId, ctx);
  await auditService.log(auth, 'update', 'setting', setting.id, old, setting, ctx);
  revalidatePath(`/${locale}/settings`);
  return { success: true, data: setting };
}

export async function previewImport(locale: string, formData: FormData) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No file provided' };

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  const locations = await locationsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
  const locationMap = new Map(locations.map((l) => [l.name_en.toLowerCase(), l.id]));

  const preview = rows.map((row, index) => {
    const errors = validationService.validateImportRow(row, index + 2);
    let locationId = row.location_id as string | undefined;
    if (!locationId && row.location_name) {
      locationId = locationMap.get(String(row.location_name).toLowerCase());
      if (!locationId) errors.push(`Row ${index + 2}: location not found`);
    }
    return { row: index + 2, data: { ...row, location_id: locationId }, errors, valid: errors.length === 0 };
  });

  return { success: true, data: preview, totalRows: rows.length };
}

export async function executeImport(locale: string, rows: Array<{
  location_id: string;
  unit_number: string;
  floor?: string;
  area_sqm?: number;
  monthly_rent: number;
  payment_cycle: PaymentCycle;
  rent_start_date?: string | null;
  rent_end_date?: string | null;
  status: UnitStatus;
}>) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const errors: Array<{ row: number; message: string }> = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const validation = validationService.validateUnit(row);
    if (!validation.valid) {
      errors.push({ row: i + 1, message: validation.errors.join(', ') });
      continue;
    }
    try {
      await unitsRepository.create({
        location_id: row.location_id,
        unit_number: row.unit_number,
        floor: row.floor ?? null,
        area_sqm: row.area_sqm ?? null,
        monthly_rent: row.monthly_rent,
        payment_cycle: row.payment_cycle,
        rent_start_date: row.rent_start_date ?? null,
        rent_end_date: row.rent_end_date ?? null,
        status: row.status,
        tenant_id: null,
      }, ctx);
      successCount++;
    } catch (e) {
      errors.push({ row: i + 1, message: String(e) });
    }
  }

  await importLogsRepository.create({
    file_name: 'import.xlsx',
    total_rows: rows.length,
    success_count: successCount,
    error_count: errors.length,
    errors,
    imported_by: auth.userId,
  }, ctx);

  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/import`);
  return { success: true, successCount, errorCount: errors.length, errors };
}
