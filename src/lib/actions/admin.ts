'use server';

import { requireAuth, requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { reportingService } from '@/lib/services/reporting-service';
import { rentalService } from '@/lib/services/rental-service';
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
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

const MAX_IMPORT_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const ALLOWED_IMPORT_EXTENSIONS = new Set(['.xlsx', '.csv']);
const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/octet-stream',
]);

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex).toLowerCase();
}

function validateImportFile(file: File) {
  const extension = getFileExtension(file.name);

  if (!ALLOWED_IMPORT_EXTENSIONS.has(extension)) {
    return 'Only .xlsx and .csv files are supported';
  }

  if (file.type && !ALLOWED_IMPORT_MIME_TYPES.has(file.type)) {
    return 'Unsupported file type';
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return 'Import file must be 2MB or smaller';
  }

  return null;
}

function normalizeCellValue(value: unknown): unknown {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'object') {
    const cellObject = value as {
      result?: unknown;
      text?: unknown;
      hyperlink?: unknown;
      richText?: Array<{ text?: string }>;
    };

    if ('result' in cellObject) return normalizeCellValue(cellObject.result);
    if (Array.isArray(cellObject.richText)) {
      return normalizeCellValue(cellObject.richText.map((part) => part.text ?? '').join(''));
    }
    if ('text' in cellObject) return normalizeCellValue(cellObject.text);
    if ('hyperlink' in cellObject) return normalizeCellValue(cellObject.hyperlink);
  }

  return String(value).trim() || undefined;
}

async function readImportRows(file: File): Promise<Array<Record<string, unknown>>> {
  const extension = getFileExtension(file.name);
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  if (extension === '.csv') {
    await workbook.csv.read(Readable.from([Buffer.from(arrayBuffer)]));
  } else {
    await workbook.xlsx.load(arrayBuffer);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Import file must contain at least one worksheet');
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];

  for (let index = 1; index <= headerRow.cellCount; index++) {
    const header = normalizeCellValue(headerRow.getCell(index).value);
    headers.push(typeof header === 'string' ? header : '');
  }

  if (!headers.some(Boolean)) {
    throw new Error('Import file must contain a header row');
  }

  const rows: Array<Record<string, unknown>> = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new Error(`Import file cannot contain more than ${MAX_IMPORT_ROWS} data rows`);
    }

    const row = sheet.getRow(rowNumber);
    const data: Record<string, unknown> = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = normalizeCellValue(row.getCell(index + 1).value);
      if (value !== undefined) {
        data[header] = value;
        hasValue = true;
      }
    });

    if (hasValue) rows.push(data);
  }

  return rows;
}

export async function getDebtAgingReport(locale: string, filters?: { locationId?: string }) {
  const auth = await requireAuth(locale, await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  if (auth.isAdminEditor) {
    await rentalService.generateDueInvoices(auth, ctx);
  }
  return reportingService.getDebtAgingInvoices(auth, ctx, filters);
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
  const fileError = validateImportFile(file);
  if (fileError) return { success: false, error: fileError };

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await readImportRows(file);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to read import file' };
  }

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
