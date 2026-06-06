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
import { contractService } from '@/lib/services/contract-service';
import { tenantsRepository } from '@/lib/repositories/tenants';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { UserRole, UnitStatus, PaymentCycle } from '@/types/database';
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
        status: row.status,
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

// ─── Arabic header aliases ───────────────────────────────────────────────────

/** Strip all whitespace, parentheses, dashes, and ريال suffix for fuzzy matching */
function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')            // collapse multiple spaces
    .replace(/[()（）\-–—]/g, '')    // remove parens and dashes
    .replace(/ريال/g, '')            // remove ريال
    .replace(/\s+/g, ' ')
    .trim();
}

// Keys are already normalized via normalizeHeaderKey
const CONTRACT_HEADER_MAP: Array<[string, string]> = [
  ['رقم العقد', 'contract_number'],
  ['اسم المستأجر', 'tenant_name'],
  ['رقم الوحدة', 'unit_number'],
  ['تاريخ الإبرام', 'signed_date'],
  ['تاريخ بداية الإيجار', 'start_date'],
  ['تاريخ نهاية الإيجار', 'end_date'],
  ['إجمالي قيمة العقد', 'total_amount'],
  ['قيمة الدفعة الدورية', 'periodic_amount'],
  ['عدد الدفعات', 'payment_count'],
];

const CONTRACT_NORMALIZED_MAP = new Map(
  CONTRACT_HEADER_MAP.map(([ar, field]) => [normalizeHeaderKey(ar), field])
);

function resolveContractHeader(raw: string): string {
  const normalized = normalizeHeaderKey(raw);
  return CONTRACT_NORMALIZED_MAP.get(normalized) ?? normalized;
}

/** Parse a number that may come as string "28,500.00" or number 28500 */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeContractRow(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = resolveContractHeader(key);
    // Parse numeric fields immediately
    if (field === 'total_amount' || field === 'periodic_amount' || field === 'payment_count') {
      result[field] = parseNumber(value);
    } else {
      result[field] = value;
    }
  }
  return result;
}

function inferPaymentCycle(total: number, periodic: number): PaymentCycle {
  if (!periodic || periodic <= 0) return 'yearly';
  const ratio = Math.round(total / periodic);
  if (ratio <= 1) return 'yearly';
  if (ratio <= 2) return 'semi_annual';
  if (ratio <= 4) return 'quarterly';
  return 'monthly';
}

function validateContractImportRow(row: Record<string, unknown>, rowIndex: number): string[] {
  const errors: string[] = [];
  if (!row.unit_number && row.unit_number !== 0) errors.push(`Row ${rowIndex}: رقم الوحدة مطلوب`);
  if (!row.start_date) errors.push(`Row ${rowIndex}: تاريخ بداية الإيجار مطلوب`);
  if (!row.end_date) errors.push(`Row ${rowIndex}: تاريخ نهاية الإيجار مطلوب`);
  const total = row.total_amount as number | null;
  if (total === null || total === undefined || total <= 0) {
    errors.push(`Row ${rowIndex}: إجمالي قيمة العقد يجب أن يكون رقمًا موجبًا`);
  }
  const periodic = row.periodic_amount as number | null;
  if (periodic === null || periodic === undefined || periodic <= 0) {
    errors.push(`Row ${rowIndex}: قيمة الدفعة الدورية يجب أن تكون رقمًا موجبًا`);
  }
  if (row.start_date && row.end_date && String(row.end_date) < String(row.start_date)) {
    errors.push(`Row ${rowIndex}: تاريخ النهاية يجب أن يكون بعد تاريخ البداية`);
  }
  return errors;
}

export async function previewContractImport(locale: string, formData: FormData) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No file provided' };
  const fileError = validateImportFile(file);
  if (fileError) return { success: false, error: fileError };

  let rawRows: Array<Record<string, unknown>>;
  try {
    rawRows = await readImportRows(file);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to read import file' };
  }

  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const units = await unitsRepository.findAll(ctx);
  const unitMap = new Map(units.map((u) => [String(u.unit_number).trim(), u]));

  const preview = await Promise.all(rawRows.map(async (raw, index) => {
    const row = normalizeContractRow(raw);
    const rowIndex = index + 2;
    const errors = validateContractImportRow(row, rowIndex);

    // unit_number may come as number (e.g. 1) or string ("1") from Excel
    const unitNumber = row.unit_number != null ? String(row.unit_number).trim() : '';
    // Try exact match first, then integer match (e.g. "1.0" → "1")
    const unit = unitMap.get(unitNumber)
      ?? unitMap.get(String(parseInt(unitNumber, 10)));

    if (unitNumber && !unit) {
      errors.push(`Row ${rowIndex}: الوحدة رقم "${unitNumber}" غير موجودة`);
    } else if (unit?.active_contract) {
      errors.push(`Row ${rowIndex}: الوحدة "${unitNumber}" لديها عقد نشط بالفعل`);
    }

    const total = Number(row.total_amount);
    const periodic = Number(row.periodic_amount);
    const payment_cycle = errors.length === 0 ? inferPaymentCycle(total, periodic) : null;

    return {
      row: rowIndex,
      data: {
        contract_number: row.contract_number ? String(row.contract_number).trim() : null,
        tenant_name: row.tenant_name ? String(row.tenant_name).trim() : null,
        unit_id: unit?.id ?? null,
        unit_number: unitNumber,
        start_date: row.start_date ? String(row.start_date) : '',
        end_date: row.end_date ? String(row.end_date) : '',
        total_amount: total,
        payment_cycle,
      },
      errors,
      valid: errors.length === 0,
    };
  }));

  return { success: true, data: preview, totalRows: rawRows.length };
}

export async function executeContractImport(locale: string, rows: Array<{
  contract_number: string | null;
  tenant_name: string | null;
  unit_id: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_cycle: PaymentCycle;
}>) {
  const auth = await requireAdminEditor(locale, await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };

  const errors: Array<{ row: number; message: string }> = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      let tenantName: string | null = null;
      let tenantPhone: string | null = null;
      let tenantEmail: string | null = null;
      if (row.tenant_name?.trim()) {
        tenantName = row.tenant_name.trim();
      }

      const result = await contractService.create(auth, {
        unit_id: row.unit_id,
        contract_number: row.contract_number || null,
        start_date: row.start_date,
        end_date: row.end_date,
        total_amount: row.total_amount,
        payment_cycle: row.payment_cycle,
        tenant_name: tenantName,
        tenant_phone: tenantPhone,
        tenant_email: tenantEmail,
      }, ctx);

      if (result.success) {
        successCount++;
      } else {
        errors.push({ row: i + 1, message: result.error ?? 'Unknown error' });
      }
    } catch (e) {
      errors.push({ row: i + 1, message: String(e) });
    }
  }

  await importLogsRepository.create({
    file_name: 'contracts-import.xlsx',
    total_rows: rows.length,
    success_count: successCount,
    error_count: errors.length,
    errors,
    imported_by: auth.userId,
  }, ctx);

  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/import`);
  return { success: true, successCount, errorCount: errors.length, errors };
}
