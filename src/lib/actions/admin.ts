'use server';

import { requireAuth, requirePermission } from '@/lib/auth/session';
import { rolesRepository } from '@/lib/repositories/roles';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { reportingService } from '@/lib/services/reporting-service';
import { usersRepository } from '@/lib/repositories/users';
import { settingsRepository } from '@/lib/repositories/settings';
import { auditService } from '@/lib/services/audit-service';
import { unitsRepository } from '@/lib/repositories/units';
import { contractsRepository } from '@/lib/repositories/contracts';
import { paymentsRepository } from '@/lib/repositories/payments';
import { locationsRepository } from '@/lib/repositories/locations';
import { importLogsRepository } from '@/lib/repositories/settings';
import { validationService } from '@/lib/services/validation-service';
import { contractService } from '@/lib/services/contract-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { UnitStatus, PaymentCycle } from '@/types/database';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { isReasonableContractDate } from '@/lib/dates/contract-dates';
import { validateContractOpeningBalance } from '@/lib/rental/validate-opening-balance';
import { openingBalanceImportBlockedReason } from '@/lib/rental/contract-opening-balance';
import { hasOpeningBalanceInput } from '@/lib/features/guards';
import {
  CONTRACT_EXCEL_DATE_FIELDS,
  CONTRACT_EXCEL_NUMERIC_FIELDS,
  resolveContractExcelHeader,
  type ContractExcelField,
} from '@/lib/import/contract-excel-columns';
import {
  buildContractsExcelRows,
  inferPaymentCycleFromAmounts,
} from '@/lib/import/contract-excel-export';
import { normalizeNumberInputValue } from '@/lib/i18n/numbers';
import { validateStaffPassword } from '@/lib/validation/password-policy';
import { z } from 'zod';
import {
  FEATURE_FLAG_KEYS,
  featureFlagSettingKey,
  isFeatureFlagKey,
  resolveFeatureFlags,
  revalidatePathsForFlag,
  type FeatureFlagKey,
} from '@/lib/features';
import { loadFeatureFlags, requireFeatureEnabled } from '@/lib/features/load-feature-flags';
import {
  buildRateLimitKey,
  clearRateLimit,
  isRateLimited,
  recordRateLimitFailure,
} from '@/lib/security/rate-limit';

const MAX_IMPORT_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const IMPORT_RATE_LIMIT_ATTEMPTS = 10;
const IMPORT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const GENERIC_IMPORT_RATE_LIMIT_ERROR = 'Too many import attempts. Try again later.';
const USER_SECURITY_RATE_LIMIT_ATTEMPTS = 5;
const USER_SECURITY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const userIdSchema = z.string().uuid();
const staffEmailSchema = z.string().trim().toLowerCase().email().max(254);
const staffFullNameSchema = z.string().trim().min(1).max(120);
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
  const auth = await requirePermission(locale, 'reports.view', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'reports_operational');
  if (disabled) return [];
  return reportingService.getDebtAgingInvoices(auth, ctx, filters);
}

export async function getDashboardOverview(locale: string, filters?: { locationId?: string }) {
  const auth = await requireAuth(locale, await getCtx());
  return reportingService.getDashboardOverview(auth, {
    ...await getCtx(),
    user_id: auth.userId,
    role: auth.role,
  }, filters);
}

export async function getPortfolioSummary(locale: string) {
  const overview = await getDashboardOverview(locale);
  return overview.summary;
}

export async function getLocationsOccupancy(locale: string) {
  const overview = await getDashboardOverview(locale);
  return overview.locationsOccupancy;
}

export async function getDashboardDebtAging(locale: string, filters?: { locationId?: string }) {
  const auth = await requirePermission(locale, 'reports.view', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'reports_operational');
  if (disabled) return null;
  return reportingService.getDashboardDebtAgingSummary(auth, ctx, filters);
}

export async function getDashboardOdooHealth(locale: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_invoices_documents');
  if (disabled) return null;
  return reportingService.getDashboardOdooHealth(auth, ctx);
}

export async function getLocationStatement(locale: string, locationId: string) {
  const auth = await requirePermission(locale, 'reports.view', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'reports_operational');
  if (disabled) return null;
  return reportingService.getLocationStatement(auth, ctx, locationId);
}

function profileBanState(bannedUntil: string | null | undefined) {
  const banned_until = bannedUntil ?? null;
  if (!banned_until) {
    return { banned_until: null, is_active: true };
  }
  const untilMs = Date.parse(banned_until);
  const is_active = !Number.isFinite(untilMs) || untilMs <= Date.now();
  return { banned_until, is_active };
}

export async function getUsers(locale: string) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const profiles = await usersRepository.findAll(ctx);

  const banById = new Map<string, string | null>();
  try {
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (!error && data?.users) {
      for (const user of data.users) {
        banById.set(user.id, user.banned_until ?? null);
      }
    }
  } catch {
    // Ban state is display-only; profiles still load if auth admin list fails.
  }

  return profiles.map((profile) => ({
    ...profile,
    ...profileBanState(banById.get(profile.id)),
  }));
}

export async function setUserActive(locale: string, userId: string, active: boolean) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const parsedUserId = userIdSchema.safeParse(userId);
  if (!parsedUserId.success) return { success: false, error: 'userNotFound' };

  if (!active && parsedUserId.data === auth.userId) {
    return { success: false, error: 'cannotDeactivateSelf' };
  }

  const target = await usersRepository.findById(parsedUserId.data, ctx);
  if (!target) return { success: false, error: 'userNotFound' };
  if (target.assigned_role?.is_system_owner && !auth.isAdminEditor) {
    return { success: false, error: 'systemOwnerProtected' };
  }

  if (!active && target.assigned_role?.is_system_owner) {
    const owners = (await rolesRepository.findAll(ctx))
      .filter((item) => item.is_system_owner);
    const ownerRoleId = owners[0]?.id;
    if (ownerRoleId) {
      const ownerCount = await usersRepository.countByRoleId(ownerRoleId, ctx);
      if (ownerCount <= 1) {
        return { success: false, error: 'cannotDeactivateLastOwner' };
      }
    }
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
    ban_duration: active ? 'none' : '876000h',
  });
  if (error) {
    return { success: false, error: active ? 'reactivateFailed' : 'deactivateFailed' };
  }

  const banState = profileBanState(data.user?.banned_until ?? (active ? null : new Date().toISOString()));
  await auditService.log(
    auth,
    active ? 'reactivate_user' : 'deactivate_user',
    'profile',
    target.id,
    { is_active: !active },
    { is_active: banState.is_active },
    ctx,
  );

  revalidatePath(`/${locale}/users`);
  return {
    success: true,
    data: {
      ...target,
      ...banState,
    },
  };
}

export async function getImportLogs(locale: string) {
  const auth = await requirePermission(locale, 'imports.manage', await getCtx());
  return importLogsRepository.findAll(
    { ...await getCtx(), user_id: auth.userId, role: auth.role },
    100,
  );
}

export async function getAssignableRoles(locale: string) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  return rolesRepository.findAssignable({
    ...await getCtx(),
    user_id: auth.userId,
    role: auth.role,
    // Only system owners may assign the system-owner role.
    excludeSystemOwner: !auth.isAdminEditor,
  });
}

export async function createUser(locale: string, data: {
  full_name: string;
  email: string;
  temporary_password: string;
  role_id: string;
}) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const fullName = data.full_name.trim();
  const email = data.email.trim().toLowerCase();
  const temporaryPassword = data.temporary_password;
  const GENERIC_CREATE_USER_ERROR = 'Failed to create user';

  if (!fullName) return { success: false, error: 'Name is required' };
  if (!email) return { success: false, error: 'Email is required' };
  const passwordError = validateStaffPassword(temporaryPassword);
  if (passwordError) return { success: false, error: passwordError };

  const role = await rolesRepository.findById(data.role_id, ctx);
  if (!role) return { success: false, error: 'Invalid role' };
  if (role.is_system_owner && !auth.isAdminEditor) {
    return { success: false, error: 'Cannot assign the system owner role' };
  }

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
    return { success: false, error: GENERIC_CREATE_USER_ERROR };
  }

  const profile = await usersRepository.upsertProfile({
    id: created.user.id,
    email,
    full_name: fullName,
    role_id: role.id,
    must_change_password: true,
  }, ctx);

  await auditService.log(
    auth,
    'create_user',
    'profile',
    profile.id,
    {
      old_role_id: null,
    },
    {
      created_by: auth.userId,
      target_user_id: profile.id,
      old_role_id: null,
      new_role_id: profile.role_id,
      new_role_slug: role.slug,
      timestamp: new Date().toISOString(),
    },
    ctx
  );

  revalidatePath(`/${locale}/users`);
  return { success: true, data: profile };
}

export async function updateUserRole(locale: string, userId: string, roleId: string) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  if (!userId || !roleId) return { success: false, error: 'Invalid role assignment' };

  const role = await rolesRepository.findById(roleId, ctx);
  if (!role) return { success: false, error: 'Invalid role' };
  if (role.is_system_owner && !auth.isAdminEditor) {
    return { success: false, error: 'Cannot assign the system owner role' };
  }

  const old = await usersRepository.findById(userId, ctx);
  if (!old) return { success: false, error: 'User not found' };

  const wasOwner = Boolean(old.assigned_role?.is_system_owner);
  if (wasOwner && !role.is_system_owner) {
    const owners = (await rolesRepository.findAll(ctx))
      .filter((item) => item.is_system_owner);
    const ownerRoleId = owners[0]?.id;
    if (ownerRoleId) {
      const ownerCount = await usersRepository.countByRoleId(ownerRoleId, ctx);
      if (ownerCount <= 1) {
        return { success: false, error: 'Cannot demote the last system owner' };
      }
    }
  }

  try {
    const profile = await usersRepository.updateRoleId(userId, roleId, ctx);
    await auditService.log(
      auth,
      'update_role',
      'profile',
      userId,
      {
        created_by: auth.userId,
        target_user_id: userId,
        old_role_id: old.role_id,
        old_role_slug: old.assigned_role?.slug ?? null,
        new_role_id: roleId,
        timestamp: new Date().toISOString(),
      },
      {
        created_by: auth.userId,
        target_user_id: userId,
        old_role_id: old.role_id,
        new_role_id: profile.role_id,
        new_role_slug: role.slug,
        timestamp: new Date().toISOString(),
      },
      ctx
    );
    revalidatePath(`/${locale}/users`);
    return { success: true, data: profile };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('last system owner')) {
      return { success: false, error: 'Cannot demote the last system owner' };
    }
    return { success: false, error: 'Failed to update role' };
  }
}

export async function updateUserFullName(locale: string, userId: string, fullNameInput: string) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const parsedUserId = userIdSchema.safeParse(userId);
  const parsedFullName = staffFullNameSchema.safeParse(fullNameInput);
  if (!parsedUserId.success) return { success: false, error: 'userNotFound' };
  if (!parsedFullName.success) return { success: false, error: 'nameInvalid' };

  const target = await usersRepository.findById(parsedUserId.data, ctx);
  if (!target) return { success: false, error: 'userNotFound' };
  if (target.assigned_role?.is_system_owner && !auth.isAdminEditor) {
    return { success: false, error: 'systemOwnerProtected' };
  }
  if (target.full_name === parsedFullName.data) return { success: true, data: target };

  try {
    const profile = await usersRepository.updateFullName(target.id, parsedFullName.data, ctx);
    await auditService.log(
      auth,
      'update_user_name',
      'profile',
      target.id,
      { full_name: target.full_name },
      { full_name: profile.full_name },
      ctx,
    );
    revalidatePath(`/${locale}/users`);
    return { success: true, data: profile };
  } catch {
    return { success: false, error: 'nameUpdateFailed' };
  }
}

export async function updateUserEmail(locale: string, userId: string, emailInput: string) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const parsedUserId = userIdSchema.safeParse(userId);
  const parsedEmail = staffEmailSchema.safeParse(emailInput);
  if (!parsedUserId.success) return { success: false, error: 'userNotFound' };
  if (!parsedEmail.success) return { success: false, error: 'emailInvalid' };

  const target = await usersRepository.findById(parsedUserId.data, ctx);
  if (!target) return { success: false, error: 'userNotFound' };
  if (target.assigned_role?.is_system_owner && !auth.isAdminEditor) {
    return { success: false, error: 'systemOwnerProtected' };
  }

  const nextEmail = parsedEmail.data;
  if (target.email.toLowerCase() === nextEmail) {
    return { success: true, data: target };
  }

  const rateLimitKey = await buildRateLimitKey(
    'admin-user-email',
    `${auth.userId}:${target.id}`,
  );
  if (await isRateLimited(
    rateLimitKey.keyHash,
    USER_SECURITY_RATE_LIMIT_ATTEMPTS,
    USER_SECURITY_RATE_LIMIT_WINDOW_MS,
  )) {
    return { success: false, error: 'rateLimited' };
  }

  const supabaseAdmin = createAdminClient();
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
    email: nextEmail,
  });
  if (authError) {
    await recordRateLimitFailure(
      rateLimitKey,
      USER_SECURITY_RATE_LIMIT_ATTEMPTS,
      USER_SECURITY_RATE_LIMIT_WINDOW_MS,
    );
    return { success: false, error: 'emailUpdateFailed' };
  }

  try {
    const profile = await usersRepository.updateEmail(target.id, nextEmail, ctx);
    await clearRateLimit(rateLimitKey.keyHash);
    await auditService.log(
      auth,
      'update_user_email',
      'profile',
      target.id,
      { email: target.email },
      { email: profile.email },
      ctx,
    );
    revalidatePath(`/${locale}/users`);
    return { success: true, data: profile };
  } catch {
    const { error: rollbackError } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
      email: target.email,
    });
    if (rollbackError) {
      await auditService.log(
        auth,
        'update_user_email_partial_failure',
        'profile',
        target.id,
        { profile_email: target.email },
        { auth_email: nextEmail, profile_email: target.email },
        ctx,
      );
    }
    return { success: false, error: 'emailUpdateFailed' };
  }
}

export async function resetUserPassword(locale: string, userId: string, password: string) {
  const auth = await requirePermission(locale, 'users.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const parsedUserId = userIdSchema.safeParse(userId);
  if (!parsedUserId.success) return { success: false, error: 'userNotFound' };
  if (validateStaffPassword(password)) return { success: false, error: 'passwordInvalid' };

  const target = await usersRepository.findById(parsedUserId.data, ctx);
  if (!target) return { success: false, error: 'userNotFound' };
  if (target.assigned_role?.is_system_owner && !auth.isAdminEditor) {
    return { success: false, error: 'systemOwnerProtected' };
  }

  const rateLimitKey = await buildRateLimitKey(
    'admin-user-password',
    `${auth.userId}:${target.id}`,
  );
  if (await isRateLimited(
    rateLimitKey.keyHash,
    USER_SECURITY_RATE_LIMIT_ATTEMPTS,
    USER_SECURITY_RATE_LIMIT_WINDOW_MS,
  )) {
    return { success: false, error: 'rateLimited' };
  }

  const previousMustChangePassword = Boolean(target.must_change_password);
  try {
    await usersRepository.updateMustChangePassword(target.id, false, ctx);
  } catch {
    return { success: false, error: 'passwordUpdateFailed' };
  }

  const restorePasswordFlag = async () => {
    try {
      await usersRepository.updateMustChangePassword(
        target.id,
        previousMustChangePassword,
        ctx,
      );
    } catch {
      // A later retry safely attempts to clear the flag again.
    }
  };

  let authError = false;
  try {
    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, { password });
    authError = Boolean(error);
  } catch {
    authError = true;
  }

  if (authError) {
    await restorePasswordFlag();
    await recordRateLimitFailure(
      rateLimitKey,
      USER_SECURITY_RATE_LIMIT_ATTEMPTS,
      USER_SECURITY_RATE_LIMIT_WINDOW_MS,
    );
    return { success: false, error: 'passwordUpdateFailed' };
  }

  await clearRateLimit(rateLimitKey.keyHash);
  await auditService.log(
    auth,
    'reset_user_password',
    'profile',
    target.id,
    null,
    { password_changed: true },
    ctx,
  );
  revalidatePath(`/${locale}/users`);
  return { success: true };
}

export async function getSettings(locale: string) {
  const auth = await requirePermission(locale, 'settings.manage', await getCtx());
  return settingsRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function getResolvedFeatureFlags(locale: string) {
  const auth = await requireAuth(locale, await getCtx());
  const settings = await settingsRepository.findAll({
    ...await getCtx(),
    user_id: auth.userId,
    role: auth.role,
  });
  // RLS only returns feature_flag.* (and full settings for privileged roles).
  return resolveFeatureFlags(settings.filter((setting) => setting.key.startsWith('feature_flag.')));
}

export async function getFeatureFlags(locale: string) {
  const auth = await requirePermission(locale, 'feature_flags.manage', await getCtx());
  return loadFeatureFlags({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function updateFeatureFlag(
  locale: string,
  key: FeatureFlagKey,
  enabled: boolean,
) {
  const auth = await requirePermission(locale, 'feature_flags.manage', await getCtx());
  if (!isFeatureFlagKey(key) || !FEATURE_FLAG_KEYS.includes(key) || typeof enabled !== 'boolean') {
    return { success: false as const, error: 'invalidFeatureFlag' as const };
  }

  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const settingKey = featureFlagSettingKey(key);
  const old = await settingsRepository.findByKey(settingKey, ctx);
  const setting = await settingsRepository.upsert(settingKey, enabled, auth.userId, ctx);
  await auditService.log(auth, 'update_feature_flag', 'setting', setting.id, {
    ...(old ?? {}),
    flag_key: key,
  }, {
    ...setting,
    flag_key: key,
  }, ctx);

  revalidatePath(`/${locale}/feature-flags`);
  for (const path of revalidatePathsForFlag(locale, key)) {
    revalidatePath(path);
  }
  return { success: true as const, data: setting };
}

async function consumeImportRateLimit(userId: string) {
  const key = await buildRateLimitKey('import', userId);
  if (await isRateLimited(key.keyHash, IMPORT_RATE_LIMIT_ATTEMPTS, IMPORT_RATE_LIMIT_WINDOW_MS)) {
    return { ok: false as const };
  }
  // Only check existing lock; successful previews/executes do not consume quota.
  return { ok: true as const, key };
}

async function recordImportRateLimitFailure(userId: string) {
  const key = await buildRateLimitKey('import', userId);
  await recordRateLimitFailure(key, IMPORT_RATE_LIMIT_ATTEMPTS, IMPORT_RATE_LIMIT_WINDOW_MS);
}

const ALLOWED_SETTING_KEYS = new Set([
  'company_name',
  'company_name_ar',
  'default_payment_terms_days',
  'overdue_grace_days',
  'due_reminder_days',
  'dashboard_due_horizons',
  'default_payment_cycle',
  'default_tax_mode',
  'vat_rate',
  'invoice_prefix',
  'currency',
]);

export async function updateSetting(locale: string, key: string, value: unknown) {
  const auth = await requirePermission(locale, 'settings.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  if (!ALLOWED_SETTING_KEYS.has(key)) {
    return { success: false as const, error: 'Setting key is not allowed' };
  }
  // Odoo integration settings require the dedicated Odoo permission boundary.
  if (key === 'odoo_integration') {
    return { success: false as const, error: 'Use the Odoo settings action instead' };
  }
  if (key === 'company_name') {
    const companyName = value as { en?: unknown; ar?: unknown } | null;
    if (
      !companyName
      || typeof companyName !== 'object'
      || typeof companyName.en !== 'string'
      || typeof companyName.ar !== 'string'
      || companyName.en.length > 200
      || companyName.ar.length > 200
    ) {
      return { success: false as const, error: 'Invalid company name' };
    }
  }
  if (key === 'default_payment_terms_days' && (
    typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 3650
  )) {
    return { success: false as const, error: 'Invalid payment terms' };
  }
  if (key === 'overdue_grace_days' && (
    typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 365
  )) {
    return { success: false as const, error: 'Invalid overdue grace period' };
  }
  if (key === 'due_reminder_days' && (
    typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 90
  )) {
    return { success: false as const, error: 'Invalid due reminder period' };
  }
  if (key === 'dashboard_due_horizons' && (
    !Array.isArray(value)
    || value.length !== 3
    || value.some((days) => !Number.isSafeInteger(days) || days < 1 || days > 90)
    || !(value[0] < value[1] && value[1] < value[2])
  )) {
    return { success: false as const, error: 'Invalid dashboard due horizons' };
  }
  const old = await settingsRepository.findByKey(key, ctx);
  const setting = await settingsRepository.upsert(key, value, auth.userId, ctx);
  await auditService.log(auth, 'update', 'setting', setting.id, old, setting, ctx);
  revalidatePath(`/${locale}/settings`);
  if (key === 'due_reminder_days' || key === 'dashboard_due_horizons') {
    revalidatePath(`/${locale}/dashboard`);
    revalidatePath(`/${locale}/due-this-month`);
  }
  return { success: true, data: setting };
}

export async function previewImport(locale: string, formData: FormData) {
  const auth = await requirePermission(locale, 'imports.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'master_data_mutations');
  if (disabled) return disabled;
  const rate = await consumeImportRateLimit(auth.userId);
  if (!rate.ok) {
    return { success: false, error: GENERIC_IMPORT_RATE_LIMIT_ERROR };
  }

  const file = formData.get('file') as File;
  if (!file) {
    await recordImportRateLimitFailure(auth.userId);
    return { success: false, error: 'No file provided' };
  }
  const fileError = validateImportFile(file);
  if (fileError) {
    await recordImportRateLimitFailure(auth.userId);
    return { success: false, error: fileError };
  }

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await readImportRows(file);
  } catch {
    await recordImportRateLimitFailure(auth.userId);
    return { success: false, error: 'Failed to read import file' };
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
  const auth = await requirePermission(locale, 'imports.manage', await getCtx());
  const ctxCheck = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctxCheck, 'master_data_mutations');
  if (disabled) return disabled;
  const rate = await consumeImportRateLimit(auth.userId);
  if (!rate.ok) {
    return { success: false, error: GENERIC_IMPORT_RATE_LIMIT_ERROR };
  }
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  if (!Array.isArray(rows) || rows.length === 0) {
    await recordImportRateLimitFailure(auth.userId);
    return { success: false, error: 'No rows to import' };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    await recordImportRateLimitFailure(auth.userId);
    return { success: false, error: `Import cannot contain more than ${MAX_IMPORT_ROWS} rows` };
  }

  const locations = await locationsRepository.findAll(ctx);
  const locationIds = new Set(locations.map((location) => location.id));

  const errors: Array<{ row: number; message: string }> = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!locationIds.has(row.location_id)) {
      errors.push({ row: i + 1, message: 'Unknown location' });
      continue;
    }
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
    } catch {
      errors.push({ row: i + 1, message: 'Failed to create unit' });
    }
  }

  if (errors.length > 0 && successCount === 0) {
    await recordImportRateLimitFailure(auth.userId);
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

// ─── Contract Excel import / export ──────────────────────────────────────────

/** Parse a number that may come as string "28,500.00" or number 28500 */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  const cleaned = normalizeNumberInputValue(String(value).trim());
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeDateInput(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeContractRow(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = resolveContractExcelHeader(key) as ContractExcelField | string;
    if (CONTRACT_EXCEL_NUMERIC_FIELDS.has(field as ContractExcelField)) {
      result[field] = parseNumber(value);
    } else if (CONTRACT_EXCEL_DATE_FIELDS.has(field as ContractExcelField)) {
      result[field] = normalizeDateInput(value);
    } else {
      result[field] = value;
    }
  }
  return result;
}

function validateContractImportRow(
  row: Record<string, unknown>,
  rowIndex: number,
  mode: 'create' | 'update',
): string[] {
  const errors: string[] = [];
  if (!row.contract_number || !String(row.contract_number).trim()) {
    errors.push(`Row ${rowIndex}: رقم العقد مطلوب`);
  }

  if (mode === 'create') {
    if (!row.tenant_name || !String(row.tenant_name).trim()) {
      errors.push(`Row ${rowIndex}: اسم المستأجر مطلوب`);
    }
    if (!row.unit_number && row.unit_number !== 0) {
      errors.push(`Row ${rowIndex}: رقم الوحدة مطلوب`);
    }
    if (!row.start_date) errors.push(`Row ${rowIndex}: تاريخ بداية الإيجار مطلوب`);
    if (!row.end_date) errors.push(`Row ${rowIndex}: تاريخ نهاية الإيجار مطلوب`);
    if (row.start_date && !isReasonableContractDate(String(row.start_date))) {
      errors.push(`Row ${rowIndex}: تاريخ بداية الإيجار يجب أن يكون بصيغة YYYY-MM-DD بين 1990 و 2100`);
    }
    if (row.end_date && !isReasonableContractDate(String(row.end_date))) {
      errors.push(`Row ${rowIndex}: تاريخ نهاية الإيجار يجب أن يكون بصيغة YYYY-MM-DD بين 1990 و 2100`);
    }
    const total = row.total_amount as number | null;
    if (total === null || total === undefined || total <= 0) {
      errors.push(`Row ${rowIndex}: إجمالي قيمة العقد يجب أن يكون رقمًا موجبًا`);
    }
    const periodic = row.periodic_amount as number | null;
    if (periodic === null || periodic === undefined || periodic <= 0) {
      errors.push(`Row ${rowIndex}: قيمة الدفعة الدورية يجب أن تكون رقمًا موجبًا`);
    }
    if (
      isReasonableContractDate(String(row.start_date))
      && isReasonableContractDate(String(row.end_date))
      && String(row.end_date) < String(row.start_date)
    ) {
      errors.push(`Row ${rowIndex}: تاريخ النهاية يجب أن يكون بعد تاريخ البداية`);
    }
  }

  const startForOpening = String(row.start_date ?? '');
  const endForOpening = String(row.end_date ?? '');
  if (row.paid_through_date) {
    if (!isReasonableContractDate(String(row.paid_through_date))) {
      errors.push(`Row ${rowIndex}: آخر تاريخ مدفوع يجب أن يكون بصيغة YYYY-MM-DD بين 1990 و 2100`);
    } else if (
      isReasonableContractDate(startForOpening)
      && isReasonableContractDate(endForOpening)
    ) {
      const openingErrors = validateContractOpeningBalance(
        { start_date: startForOpening, end_date: endForOpening },
        {
          paid_through_date: String(row.paid_through_date),
          opening_paid_amount: row.opening_paid_amount as number | null,
        },
      );
      errors.push(...openingErrors.map((message) => `Row ${rowIndex}: ${message}`));
    }
  }
  const openingPaid = row.opening_paid_amount as number | null;
  if (openingPaid != null && openingPaid < 0) {
    errors.push(`Row ${rowIndex}: مبلغ المدفوع مسبقاً يجب أن يكون صفراً أو أكثر`);
  }
  if (row.opening_payment_date && !isReasonableContractDate(String(row.opening_payment_date))) {
    errors.push(`Row ${rowIndex}: تاريخ آخر دفعة فعلية غير صالح`);
  }
  return errors;
}

type ContractImportAction = 'create' | 'update';

export async function exportContractsExcel(locale: string) {
  const auth = await requirePermission(locale, 'contracts.view', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const flags = await loadFeatureFlags(ctx);
  if (!flags.import_excel_contracts) {
    return { success: false as const, error: 'featureDisabled' as const, errorCode: 'FEATURE_DISABLED' as const };
  }

  const contracts = await contractsRepository.findAll(ctx);
  const { headers, rows } = buildContractsExcelRows(contracts);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contracts');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = Math.max(14, header.length + 2);
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    success: true as const,
    data: {
      fileName: `contracts-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      fileBase64: buffer.toString('base64'),
      rowCount: rows.length,
    },
  };
}

export async function previewContractImport(locale: string, formData: FormData) {
  const auth = await requirePermission(locale, 'imports.manage', await getCtx());
  const ctxCheck = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const flags = await loadFeatureFlags(ctxCheck);
  if (!flags.import_excel_contracts) {
    return { success: false as const, error: 'featureDisabled' as const, errorCode: 'FEATURE_DISABLED' as const };
  }
  const rate = await consumeImportRateLimit(auth.userId);
  if (!rate.ok) {
    return { success: false, error: GENERIC_IMPORT_RATE_LIMIT_ERROR };
  }
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No file provided' };
  const fileError = validateImportFile(file);
  if (fileError) return { success: false, error: fileError };

  let rawRows: Array<Record<string, unknown>>;
  try {
    rawRows = await readImportRows(file);
  } catch {
    return { success: false, error: 'Failed to read import file' };
  }

  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const [units, contracts, payments] = await Promise.all([
    unitsRepository.findAll(ctx),
    contractsRepository.findAll(ctx),
    paymentsRepository.findAll(ctx),
  ]);
  const unitMap = new Map(units.map((u) => [String(u.unit_number).trim(), u]));
  const contractByNumber = new Map(
    contracts.map((contract) => [contract.contract_number.trim(), contract]),
  );
  const paymentCountsByInvoiceId = new Map<string, number>();
  for (const payment of payments) {
    paymentCountsByInvoiceId.set(
      payment.invoice_id,
      (paymentCountsByInvoiceId.get(payment.invoice_id) ?? 0) + 1,
    );
  }

  const preview = rawRows.map((raw, index) => {
    const row = normalizeContractRow(raw);
    const rowIndex = index + 2;
    const contractNumber = row.contract_number ? String(row.contract_number).trim() : '';
    const existing = contractNumber ? contractByNumber.get(contractNumber) ?? null : null;
    const action: ContractImportAction = existing ? 'update' : 'create';

    if (existing) {
      row.start_date = existing.start_date ?? row.start_date;
      row.end_date = existing.end_date ?? row.end_date;
    }

    const errors = validateContractImportRow(row, rowIndex, action);

    if (
      !flags.contracts_opening_balance
      && hasOpeningBalanceInput({
        paid_through_date: row.paid_through_date ? String(row.paid_through_date) : null,
        opening_paid_amount: row.opening_paid_amount as number | null,
        opening_payment_date: row.opening_payment_date ? String(row.opening_payment_date) : null,
      })
    ) {
      errors.push(`Row ${rowIndex}: featureDisabled`);
    }

    const unitNumber = row.unit_number != null ? String(row.unit_number).trim() : '';
    const unit = unitMap.get(unitNumber)
      ?? unitMap.get(String(parseInt(unitNumber, 10)));

    if (action === 'create') {
      if (unitNumber && !unit) {
        errors.push(`Row ${rowIndex}: الوحدة رقم "${unitNumber}" غير موجودة`);
      } else if (unit?.active_contract) {
        errors.push(`Row ${rowIndex}: الوحدة "${unitNumber}" لديها عقد نشط بالفعل`);
      }
    } else if (existing) {
      if (existing.status !== 'active' && existing.status !== 'draft') {
        errors.push(`Row ${rowIndex}: لا يمكن تحديث عقد بحالة ${existing.status}`);
      }
      const blocked = openingBalanceImportBlockedReason(
        existing.invoices ?? [],
        paymentCountsByInvoiceId,
      );
      if (blocked === 'odooLinkedInvoices') {
        errors.push(`Row ${rowIndex}: odooLinkedInvoices`);
      } else if (blocked === 'localPaymentsExist') {
        errors.push(`Row ${rowIndex}: localPaymentsExist`);
      }
    }

    const total = Number(row.total_amount);
    const periodic = Number(row.periodic_amount);
    const payment_cycle = action === 'update'
      ? (existing?.payment_cycle ?? null)
      : (errors.length === 0 ? inferPaymentCycleFromAmounts(total, periodic) : null);

    return {
      row: rowIndex,
      action,
      data: {
        contract_id: existing?.id ?? null,
        contract_number: contractNumber || null,
        tenant_name: row.tenant_name
          ? String(row.tenant_name).trim()
          : (existing?.tenant?.full_name ?? null),
        unit_id: action === 'update'
          ? (existing?.unit_id ?? existing?.lines?.find((line) => line.unit_id)?.unit_id ?? null)
          : (unit?.id ?? null),
        unit_number: unitNumber || (existing?.unit?.unit_number ?? ''),
        start_date: action === 'update'
          ? (existing?.start_date ?? '')
          : (row.start_date ? String(row.start_date) : ''),
        end_date: action === 'update'
          ? (existing?.end_date ?? '')
          : (row.end_date ? String(row.end_date) : ''),
        total_amount: action === 'update' ? Number(existing?.total_amount ?? 0) : total,
        payment_cycle,
        paid_through_date: flags.contracts_opening_balance && row.paid_through_date
          ? String(row.paid_through_date)
          : null,
        opening_paid_amount: flags.contracts_opening_balance && row.opening_paid_amount != null
          ? Number(row.opening_paid_amount)
          : null,
        opening_payment_date: flags.contracts_opening_balance && row.opening_payment_date
          ? String(row.opening_payment_date)
          : null,
      },
      errors,
      valid: errors.length === 0,
    };
  });

  return { success: true, data: preview, totalRows: rawRows.length };
}

export async function executeContractImport(locale: string, rows: Array<{
  action: ContractImportAction;
  contract_id?: string | null;
  contract_number: string;
  tenant_name: string;
  unit_id?: string | null;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_cycle: PaymentCycle;
  paid_through_date?: string | null;
  opening_paid_amount?: number | null;
  opening_payment_date?: string | null;
}>) {
  const auth = await requirePermission(locale, 'imports.manage', await getCtx());
  const ctx = { ...await getCtx(), user_id: auth.userId, role: auth.role };
  const flags = await loadFeatureFlags(ctx);
  if (!flags.import_excel_contracts) {
    return { success: false as const, error: 'featureDisabled' as const, errorCode: 'FEATURE_DISABLED' as const };
  }
  if (
    !flags.contracts_opening_balance
    && rows.some((row) => hasOpeningBalanceInput(row))
  ) {
    return { success: false as const, error: 'featureDisabled' as const, errorCode: 'FEATURE_DISABLED' as const };
  }
  const rate = await consumeImportRateLimit(auth.userId);
  if (!rate.ok) {
    return { success: false, error: GENERIC_IMPORT_RATE_LIMIT_ERROR };
  }

  const errors: Array<{ row: number; message: string }> = [];
  let successCount = 0;
  let createCount = 0;
  let updateCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (row.action === 'update') {
        if (!row.contract_id) {
          errors.push({ row: i + 1, message: 'contractNotFound' });
          continue;
        }
        const result = await contractService.applyOpeningBalanceFromImport(auth, row.contract_id, {
          paid_through_date: flags.contracts_opening_balance ? row.paid_through_date ?? null : null,
          opening_paid_amount: flags.contracts_opening_balance ? row.opening_paid_amount ?? null : null,
          opening_payment_date: flags.contracts_opening_balance ? row.opening_payment_date ?? null : null,
        }, ctx);
        if (result.success) {
          successCount++;
          updateCount++;
        } else {
          errors.push({ row: i + 1, message: result.error ?? 'Unknown error' });
        }
        continue;
      }

      if (!row.unit_id) {
        errors.push({ row: i + 1, message: 'unitRequired' });
        continue;
      }
      const result = await contractService.create(auth, {
        unit_id: row.unit_id,
        contract_number: row.contract_number.trim(),
        start_date: row.start_date,
        end_date: row.end_date,
        total_amount: row.total_amount,
        payment_cycle: row.payment_cycle,
        tenant_name: row.tenant_name.trim(),
        tenant_phone: null,
        tenant_email: null,
        paid_through_date: flags.contracts_opening_balance ? row.paid_through_date ?? null : null,
        opening_paid_amount: flags.contracts_opening_balance ? row.opening_paid_amount ?? null : null,
        opening_payment_date: flags.contracts_opening_balance ? row.opening_payment_date ?? null : null,
      }, ctx);

      if (result.success) {
        successCount++;
        createCount++;
      } else {
        errors.push({ row: i + 1, message: result.error ?? 'Unknown error' });
      }
    } catch {
      errors.push({
        row: i + 1,
        message: row.action === 'update' ? 'Failed to update contract' : 'Failed to create contract',
      });
    }
  }

  if (errors.length > 0 && successCount === 0) {
    await recordImportRateLimitFailure(auth.userId);
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
  return {
    success: true,
    successCount,
    createCount,
    updateCount,
    errorCount: errors.length,
    errors,
  };
}
