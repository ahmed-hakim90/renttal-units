'use server';

import { revalidatePath } from 'next/cache';
import { requireAnyPermission, requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { getPublicOdooSettings, saveOdooSettings } from '@/lib/odoo/settings';
import { isOdooInvoiceSendVisibleStatus, type OdooInvoiceSendVisibleStatus } from '@/lib/odoo/invoice-send-settings';
import { odooService } from '@/lib/odoo/service';
import { odooImportService } from '@/lib/odoo/import-service';
import { odooOutboxService } from '@/lib/odoo/outbox-service';
import { odooImportRepository } from '@/lib/repositories/odoo-import';
import { odooSyncLogsRepository } from '@/lib/repositories/settings';
import { invoicesRepository } from '@/lib/repositories/invoices';
import type { ContractTaxMode } from '@/types/database';
import type { OdooSettings } from '@/lib/odoo/settings';
import { requireFeatureEnabled, loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { shouldAllowManualOdooInvoiceSend } from '@/lib/features/guards';
import { featureDisabledResult } from '@/lib/features';
import { isPeriodBeforeOdooTracking } from '@/lib/rental/contract-opening-balance';
import { z } from 'zod';

const SENSITIVE_LOG_KEY = /(?:api[_-]?key|password|passwd|token|secret|authorization|cookie)/i;
const invoiceIdSchema = z.string().uuid();
const importIdSchema = z.string().uuid();
const importLineMappingSchema = z.object({
  unitId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  contractNumber: z.string().trim().min(1).max(64).optional(),
  localInvoiceId: z.string().uuid().optional(),
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
}).strict();
const importMappingSchema = z.object({
  lineMappings: z.record(z.string().regex(/^\d+$/), importLineMappingSchema),
}).strict();

const SAFE_ODOO_SEND_ERRORS = new Set([
  'unitNotLinkedToOdoo',
  'serviceProductInvalid',
  'odooVatTaxMissing',
  'odooZeroRatedTaxMissing',
  'odooSyncFailed',
  'odooInvoiceNeedsReview',
  'invoiceNotReadyForOdoo',
  'invoiceBeforeOdooTracking',
  'odooSendStageMismatch',
  'odooDisabled',
  'odooInvoiceNotFound',
  'NOT_FOUND',
  'VALIDATION',
]);

function sanitizeOdooActionError(error: string | undefined | null) {
  if (!error) return 'odooSyncFailed';
  if (SAFE_ODOO_SEND_ERRORS.has(error)) return error;
  return 'odooSyncFailed';
}

function revalidateInvoicePaths(locale: string) {
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/due-this-month`);
  revalidatePath(`/${locale}/partial-payments`);
  revalidatePath(`/${locale}/fully-paid`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/contracts`);
}

function sanitizeOdooLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeOdooLogValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_LOG_KEY.test(key) ? '[REDACTED]' : sanitizeOdooLogValue(nestedValue),
    ]),
  );
}

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

export async function getOdooIntegration(locale: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const [settings, logs] = await Promise.all([
    getPublicOdooSettings(ctx),
    odooSyncLogsRepository.findRecent(ctx, 25),
  ]);
  return {
    settings,
    logs: logs.map((log) => ({
      ...log,
      // Provider faults are retained server-side for diagnostics but must not
      // cross the client boundary or be rendered to operators.
      message: null,
      payload: sanitizeOdooLogValue(log.payload) as Record<string, unknown> | null,
    })),
  };
}

export async function getOdooInvoiceDocuments(
  locale: string,
  filters?: {
    unitId?: string;
    contractId?: string;
    locationId?: string;
    unmatchedOnly?: boolean;
  },
) {
  const auth = await requirePermission(locale, 'invoices.view', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_invoices_documents');
  if (disabled) return [];
  return odooImportRepository.findDocuments(filters ?? {}, ctx);
}

export async function updateOdooSettings(locale: string, data: {
  enabled: boolean;
  url: string;
  database: string;
  username: string;
  apiKey?: string;
  companyId?: number | null;
  journalId?: number | null;
  vatTaxId?: number | null;
  zeroRatedTaxId?: number | null;
  incomeAccountId?: number | null;
  productCategoryId?: number | null;
  additionalProductCategoryIds?: number[];
  serviceCategoryId?: number | null;
  vatRate?: number;
  zeroRatedTaxRate?: number;
  defaultTaxMode: ContractTaxMode;
  startDateField: string;
  endDateField: string;
  invoiceSendVisibleStatus: OdooInvoiceSendVisibleStatus;
}) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  if (!isOdooInvoiceSendVisibleStatus(data.invoiceSendVisibleStatus)) {
    return { success: false as const, error: 'VALIDATION' };
  }

  let vatRate = data.vatRate;
  let zeroRatedTaxRate = data.zeroRatedTaxRate;
  try {
    const resolved = await odooService.resolveConfiguredTaxRates(auth, ctx, data);
    if (resolved.vatRate != null) vatRate = resolved.vatRate;
    if (resolved.zeroRatedTaxRate != null) zeroRatedTaxRate = resolved.zeroRatedTaxRate;
  } catch {
    // Keep client-provided rates when Odoo is unreachable; operators can retry after connection works.
  }

  await saveOdooSettings({
    ...data,
    vatRate,
    zeroRatedTaxRate,
  }, auth.userId, ctx);
  revalidatePath(`/${locale}/settings`);
  revalidateInvoicePaths(locale);
  return { success: true };
}

export async function getOdooSetupOptions(locale: string, overrides?: Partial<OdooSettings>) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'admin_experimental');
  if (disabled) return disabled;
  return odooService.getSetupOptions(auth, ctx, overrides);
}

export async function testOdooConnection(locale: string, overrides?: Partial<OdooSettings>) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const result = await odooService.testConnection(auth, ctx, overrides);
  revalidatePath(`/${locale}/settings`);
  return result;
}

export async function createOdooTestDraftInvoice(locale: string, overrides?: Partial<OdooSettings> & { testProductId?: number | null }) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'admin_experimental');
  if (disabled) return disabled;
  const result = await odooService.createTestDraftInvoice(auth, ctx, overrides);
  revalidatePath(`/${locale}/settings`);
  return result;
}

export async function searchOdooProducts(
  locale: string,
  query: string,
  limit?: number,
  category: 'rental' | 'service' = 'rental',
) {
  const { searchOdooProducts: search } = await import('@/lib/actions/odoo-unit-catalog');
  return search(locale, query, limit, category);
}

export async function refreshOdooUnitCatalog(locale: string, limit?: number) {
  const { refreshOdooUnitCatalog: refresh } = await import('@/lib/actions/odoo-unit-catalog');
  return refresh(locale, limit);
}

export async function syncOdooServiceProductCatalog(locale: string) {
  const { syncOdooServiceProductCatalog: sync } = await import('@/lib/actions/odoo-unit-catalog');
  return sync(locale);
}

export async function linkUnitToOdooProduct(locale: string, unitId: string, productId: number) {
  const { linkUnitToOdooProduct: link } = await import('@/lib/actions/odoo-unit-catalog');
  return link(locale, unitId, productId);
}

export async function createOdooProductForUnit(locale: string, unitId: string) {
  const { createOdooProductForUnit: create } = await import('@/lib/actions/odoo-unit-catalog');
  return create(locale, unitId);
}

export async function createUnitFromOdooProduct(locale: string, input: {
  locationId: string;
  productId: number;
}) {
  const { createUnitFromOdooProduct: create } = await import('@/lib/actions/odoo-unit-catalog');
  return create(locale, input);
}

export async function searchOdooPartners(locale: string, query: string) {
  const auth = await requireAnyPermission(
    locale,
    ['contracts.create', 'contracts.update', 'odoo.manage'],
    await getCtx(),
  );
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  return odooService.searchPartners(auth, query, ctx);
}

export async function searchOdooAnalyticAccounts(locale: string, query: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  return odooService.searchAnalyticAccounts(auth, query, ctx);
}

export async function startOdooInvoiceImportPreview(locale: string, input?: { since?: string | null }) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_import_center');
  if (disabled) return disabled;
  return odooImportService.startInvoicePreview(auth, ctx, {
    since: input?.since ?? null,
    importType: input?.since ? 'incremental_sync' : 'invoices',
  });
}

export async function startOdooIncrementalImportPreview(locale: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_import_center');
  if (disabled) return disabled;
  return odooImportService.startIncrementalPreview(auth, ctx);
}

export async function getOdooInvoiceImportPreview(locale: string, runId: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_import_center');
  if (disabled) return disabled;
  return odooImportService.getInvoicePreview(runId, auth, ctx);
}

export async function updateOdooInvoiceImportMapping(
  locale: string,
  runId: string,
  itemId: string,
  mapping: Record<string, unknown>,
) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_import_center');
  if (disabled) return disabled;
  const parsed = z.object({
    runId: importIdSchema,
    itemId: importIdSchema,
    mapping: importMappingSchema,
  }).safeParse({ runId, itemId, mapping });
  if (!parsed.success) throw new Error('Invalid Odoo import mapping');
  return odooImportService.updateInvoiceMapping(
    parsed.data.runId,
    parsed.data.itemId,
    parsed.data.mapping,
    auth,
    ctx,
  );
}

export async function updateOdooInvoiceImportMappings(
  locale: string,
  runId: string,
  updates: Array<{ itemId: string; mapping: Record<string, unknown> }>,
) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_import_center');
  if (disabled) return disabled;
  const parsed = z.object({
    runId: importIdSchema,
    updates: z.array(z.object({
      itemId: importIdSchema,
      mapping: importMappingSchema,
    }).strict()).max(500),
  }).safeParse({ runId, updates });
  if (!parsed.success) throw new Error('Invalid Odoo import mappings');
  return odooImportService.updateInvoiceMappings(parsed.data.runId, parsed.data.updates, auth, ctx);
}

export async function commitOdooInvoiceImport(locale: string, runId: string, itemIds: string[]) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_import_center');
  if (disabled) return disabled;
  const parsed = z.object({
    runId: importIdSchema,
    itemIds: z.array(importIdSchema).min(1).max(500),
  }).safeParse({ runId, itemIds });
  if (!parsed.success) throw new Error('Invalid Odoo import selection');
  const result = await odooImportService.commitInvoiceImport(
    auth,
    parsed.data.runId,
    parsed.data.itemIds,
    ctx,
    { createContracts: false },
  );
  revalidatePath(`/${locale}/units`);
  revalidateInvoicePaths(locale);
  revalidatePath(`/${locale}/import`);
  return result;
}

export async function sendInvoiceToOdoo(locale: string, invoiceId: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const parsedId = invoiceIdSchema.safeParse(invoiceId);
  if (!parsedId.success) {
    return { success: false as const, error: 'VALIDATION' };
  }

  const documentsDisabled = await requireFeatureEnabled(ctx, 'odoo_invoices_documents');
  if (documentsDisabled) return documentsDisabled;

  const flags = await loadFeatureFlags(ctx);
  if (!shouldAllowManualOdooInvoiceSend(flags.odoo_invoices_documents, flags.odoo_invoice_manual_send)) {
    return featureDisabledResult();
  }

  const settings = await getPublicOdooSettings(ctx);
  if (!settings.enabled) {
    return { success: false as const, error: 'odooDisabled' };
  }

  const invoice = await invoicesRepository.findById(parsedId.data, ctx);
  if (!invoice) {
    return { success: false as const, error: 'NOT_FOUND' };
  }

  if (invoice.status !== settings.invoiceSendVisibleStatus) {
    return { success: false as const, error: 'odooSendStageMismatch' };
  }

  if (!invoice.contract_id) {
    return { success: false as const, error: 'invoiceNotReadyForOdoo' };
  }

  if (isPeriodBeforeOdooTracking(
    invoice.period_start,
    invoice.contract?.odoo_tracking_start_date,
  )) {
    return { success: false as const, error: 'invoiceBeforeOdooTracking' };
  }

  if (!invoice.unit?.odoo_product_id) {
    return { success: false as const, error: 'unitNotLinkedToOdoo' };
  }

  if (invoice.lines?.some((line) => !line.odoo_product_id && line.line_type === 'service')) {
    return { success: false as const, error: 'serviceProductInvalid' };
  }

  if (invoice.lines?.some((line) => Number(line.tax_rate) > 0) && !settings.vatTaxId) {
    return { success: false as const, error: 'odooVatTaxMissing' };
  }

  if (invoice.lines?.some((line) => line.tax_treatment === 'zero_rated') && !settings.zeroRatedTaxId) {
    return { success: false as const, error: 'odooZeroRatedTaxMissing' };
  }

  const processed = await odooOutboxService.enqueueAndProcessInvoice(auth, parsedId.data, ctx);
  const result = processed?.success
    ? { success: true as const }
    : {
      success: false as const,
      error: sanitizeOdooActionError(processed?.error),
    };
  revalidateInvoicePaths(locale);
  return result;
}

/** @deprecated Prefer sendInvoiceToOdoo — kept for compatibility with older UI calls. */
export async function retryOdooInvoiceSync(locale: string, invoiceId: string) {
  return sendInvoiceToOdoo(locale, invoiceId);
}

export async function checkOdooInvoiceStatus(locale: string, invoiceId: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const parsedId = invoiceIdSchema.safeParse(invoiceId);
  if (!parsedId.success) {
    return { success: false as const, error: 'VALIDATION' };
  }

  const disabled = await requireFeatureEnabled(ctx, 'odoo_invoices_documents');
  if (disabled) return disabled;

  const result = await odooService.checkInvoiceStatus(auth, parsedId.data, ctx);
  revalidateInvoicePaths(locale);
  if (!result.success) {
    return {
      success: false as const,
      error: sanitizeOdooActionError(result.error),
    };
  }
  return {
    success: true as const,
    data: {
      odooInvoiceState: result.odooInvoiceState ?? null,
      paymentState: result.paymentState ?? null,
      localStatus: result.localStatus ?? null,
    },
  };
}
