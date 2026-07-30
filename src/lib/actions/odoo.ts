'use server';

import { revalidatePath } from 'next/cache';
import { requireAnyPermission, requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { getPublicOdooSettings, saveOdooSettings } from '@/lib/odoo/settings';
import { odooService } from '@/lib/odoo/service';
import { odooImportService } from '@/lib/odoo/import-service';
import { odooOutboxService } from '@/lib/odoo/outbox-service';
import { odooImportRepository } from '@/lib/repositories/odoo-import';
import { odooSyncLogsRepository } from '@/lib/repositories/settings';
import type { ContractTaxMode } from '@/types/database';
import type { OdooSettings } from '@/lib/odoo/settings';
import { requireFeatureEnabled } from '@/lib/features/load-feature-flags';

const SENSITIVE_LOG_KEY = /(?:api[_-]?key|password|passwd|token|secret|authorization|cookie)/i;

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
      payload: sanitizeOdooLogValue(log.payload) as Record<string, unknown> | null,
    })),
  };
}

export async function getOdooInvoiceDocuments(
  locale: string,
  filters?: { unitId?: string; contractId?: string; locationId?: string },
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
  incomeAccountId?: number | null;
  productCategoryId?: number | null;
  additionalProductCategoryIds?: number[];
  serviceCategoryId?: number | null;
  vatRate?: number;
  defaultTaxMode: ContractTaxMode;
  startDateField: string;
  endDateField: string;
}) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  await saveOdooSettings(data, auth.userId, ctx);
  revalidatePath(`/${locale}/settings`);
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
  return odooImportService.updateInvoiceMapping(runId, itemId, mapping, auth, ctx);
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
  return odooImportService.updateInvoiceMappings(runId, updates, auth, ctx);
}

export async function commitOdooInvoiceImport(locale: string, runId: string, itemIds: string[]) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_import_center');
  if (disabled) return disabled;
  const result = await odooImportService.commitInvoiceImport(
    auth,
    runId,
    itemIds,
    ctx,
    { createContracts: false },
  );
  revalidatePath(`/${locale}/contracts`);
  revalidatePath(`/${locale}/units`);
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/import`);
  return result;
}

export async function retryOdooInvoiceSync(locale: string, invoiceId: string) {
  const auth = await requirePermission(locale, 'odoo.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };
  const disabled = await requireFeatureEnabled(ctx, 'odoo_invoices_documents');
  if (disabled) return disabled;
  const processed = await odooOutboxService.enqueueAndProcessInvoice(auth, invoiceId, ctx);
  const result = processed?.success
    ? { success: true }
    : { success: false, error: processed?.error ?? 'Odoo sync queued for retry' };
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/contracts`);
  return result;
}
