import 'server-only';

import crypto from 'node:crypto';
import { OdooClient, type OdooRecord } from '@/lib/odoo/client';
import type { XmlRpcValue } from '@/lib/odoo/xml-rpc';
import { buildOdooCategoryDomain } from '@/lib/odoo/category-domain';
import { getOdooSettings, getRentalProductCategoryIds, type OdooSettings } from '@/lib/odoo/settings';
import { getOdooProductName } from '@/lib/odoo/product-name';
import { contractsRepository } from '@/lib/repositories/contracts';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { odooSyncLogsRepository } from '@/lib/repositories/settings';
import { odooServiceProductsRepository } from '@/lib/repositories/odoo-service-products';
import { tenantsRepository } from '@/lib/repositories/tenants';
import { unitsRepository } from '@/lib/repositories/units';
import { locationsRepository } from '@/lib/repositories/locations';
import { isUniqueViolation, readUniqueViolationConstraint } from '@/lib/db/postgres-errors';
import type { AuthContext, Contract, Invoice, InvoiceLine, InvoiceStatus, PaymentCycle, Tenant, Unit } from '@/types/database';
import type { LogContext } from '@/lib/observability';

type TestResult = {
  ok: boolean;
  message: string;
  details: Record<string, unknown>;
};

type OdooRuntimeOverrides = Partial<OdooSettings> & {
  testProductId?: number | null;
};

export type OdooLegacyImportRow = {
  odooInvoiceId: number;
  odooInvoiceName: string;
  odooInvoiceState: string;
  odooPaymentState: string | null;
  contractNumber: string | null;
  unitId: string | null;
  unitNumber: string | null;
  tenantId: string | null;
  tenantName: string;
  tenantOdooPartnerId: number | null;
  tenantPhone: string | null;
  tenantEmail: string | null;
  tenantVat: string | null;
  tenantStreet: string | null;
  tenantCity: string | null;
  tenantCountryCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  invoiceDate: string | null;
  amount: number;
  paidAmount: number;
  status: InvoiceStatus;
  paymentCycle: PaymentCycle | null;
  valid: boolean;
  errors: string[];
};

export type OdooLegacyImportResult = {
  rows: OdooLegacyImportRow[];
  totalRows: number;
};

export type OdooLocationProductImportRow = {
  odooProductId: number;
  name: string;
  displayName: string;
  defaultCode: string | null;
  description: string | null;
  categoryId: number | null;
  categoryName: string | null;
  unitNumber: string;
  exists: boolean;
  valid: boolean;
  errors: string[];
};

export type OdooLocationProductImportResult = {
  rows: OdooLocationProductImportRow[];
  totalRows: number;
};

export type OdooProductCatalogRow = {
  id: number;
  name: string;
  default_code: string | null;
  display_name: string;
  description: string | null;
  category_id: number | null;
  category_name: string | null;
  suggested_unit_number: string;
  suggested_location_id: string | null;
  suggested_location_name: string | null;
};

export type OdooSetupOption = {
  id: number;
  label: string;
};

export type OdooSetupOptions = {
  companies: OdooSetupOption[];
  journals: OdooSetupOption[];
  taxes: OdooSetupOption[];
  incomeAccounts: OdooSetupOption[];
  productCategories: OdooSetupOption[];
  dateFields: Array<{ name: string; label: string }>;
  diagnostics: Array<{
    model: string;
    operation: 'fields_get' | 'search_read';
    ok: boolean;
    count?: number;
    message?: string;
  }>;
};

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createRuntimeSettings(current: OdooSettings, overrides?: Partial<OdooSettings>): OdooSettings {
  return {
    ...current,
    ...overrides,
    apiKey: overrides?.apiKey || current.apiKey,
    url: overrides?.url ? overrides.url.trim().replace(/\/+$/, '') : current.url,
    database: overrides?.database?.trim() || current.database,
    username: overrides?.username?.trim() || current.username,
  };
}

function sanitizePayload(payload: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

async function logOdoo(auth: AuthContext, action: string, entityType: string, entityId: string | null, status: 'synced' | 'failed' | 'needs_review', message: string | null, payload: Record<string, unknown>, ctx: LogContext) {
  await odooSyncLogsRepository.create({
    action,
    entity_type: entityType,
    entity_id: entityId,
    status,
    message,
    payload: sanitizePayload(payload),
    created_by: ctx.system === true ? null : auth.userId,
  }, ctx);
}

function getMany2OneId(value: unknown) {
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  if (typeof value === 'number') return value;
  return null;
}

function getMany2OneName(value: unknown) {
  if (Array.isArray(value) && typeof value[1] === 'string') return value[1];
  if (typeof value === 'string') return value;
  return null;
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function getNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function getProductLabel(product: OdooRecord) {
  return String(product.display_name ?? product.name ?? product.id);
}

function getProductDescription(product: OdooRecord) {
  return getString(product.description_sale)?.trim()
    || getString(product.description)?.trim()
    || null;
}

function getUnitOdooMetadata(product: OdooRecord) {
  return {
    odoo_product_id: product.id,
    odoo_product_reference: getString(product.default_code),
    odoo_product_name: getOdooProductName(product),
    odoo_product_display_name: getProductLabel(product),
    odoo_product_description: getProductDescription(product),
    odoo_product_category_id: getMany2OneId(product.categ_id),
    odoo_product_category_name: getMany2OneName(product.categ_id),
    odoo_sync_status: 'synced' as const,
    odoo_last_sync_at: new Date().toISOString(),
  };
}

function toProductCatalogRow(
  product: OdooRecord,
  suggestedLocation?: { id: string; name: string } | null,
): OdooProductCatalogRow {
  return {
    id: product.id,
    name: getOdooProductName(product),
    default_code: getString(product.default_code),
    display_name: getProductLabel(product),
    description: getProductDescription(product),
    category_id: getMany2OneId(product.categ_id),
    category_name: getMany2OneName(product.categ_id),
    suggested_unit_number: getOdooProductName(product),
    suggested_location_id: suggestedLocation?.id ?? null,
    suggested_location_name: suggestedLocation?.name ?? null,
  };
}

async function findRentalProduct(client: OdooClient, settings: OdooSettings, productId: number) {
  const fields = await client.fieldsGet('product.product');
  const readFields = [
    'id',
    'name',
    ...(fields.default_code ? ['default_code'] : []),
    ...(fields.display_name ? ['display_name'] : []),
    ...(fields.categ_id ? ['categ_id'] : []),
    ...(fields.description_sale ? ['description_sale'] : []),
    ...(fields.description ? ['description'] : []),
  ];
  const products = await client.searchRead('product.product', [
    ['id', '=', productId],
    ...(fields.categ_id ? buildOdooCategoryDomain(getRentalProductCategoryIds(settings)) : []),
  ], readFields, 1);
  return products[0] ?? null;
}

function normalizeOdooDate(value: unknown) {
  const text = getString(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function extractContractNumber(ref: string | null, lineName: string | null) {
  const cleanRef = ref?.trim();
  if (cleanRef) return cleanRef;

  const text = lineName?.trim();
  if (!text) return null;
  const prefixed = text.match(/\b(?:CTR|CONT|CONTRACT)[-\s:/#]*([A-Z0-9][A-Z0-9/_-]{1,})\b/i);
  if (prefixed?.[1]) return prefixed[1].trim();
  const arabicPrefixed = text.match(/عقد[-\s:/#]*([A-Z0-9][A-Z0-9/_-]{1,})/i);
  if (arabicPrefixed?.[1]) return arabicPrefixed[1].trim();
  const numbered = text.match(/\b([A-Z]*\d[A-Z0-9/_-]{2,})\b/i);
  return numbered?.[1]?.trim() ?? null;
}

function monthIndex(value: string) {
  const [year, month] = value.split('-').map(Number);
  return (year * 12) + month;
}

function inferPaymentCycleFromPeriods(periods: Array<{ periodStart: string; periodEnd: string }>): PaymentCycle | null {
  if (periods.length === 0) return null;
  const sorted = [...periods].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const monthCounts = sorted.map((period) => {
    const months = monthIndex(period.periodEnd) - monthIndex(period.periodStart) + 1;
    if (months <= 1) return 1;
    if (months <= 3) return 3;
    if (months <= 6) return 6;
    if (months <= 12) return 12;
    return null;
  });
  if (monthCounts.some((value) => value == null)) return null;
  const first = monthCounts[0];
  if (!monthCounts.every((value) => value === first)) return null;
  if (first === 1) return 'monthly';
  if (first === 3) return 'quarterly';
  if (first === 6) return 'semi_annual';
  if (first === 12) return 'yearly';
  return null;
}

function statusFromOdoo(state: string | null, paymentState: string | null, amount: number, paidAmount: number): InvoiceStatus {
  if (paymentState === 'paid') return 'fully_paid';
  if (paidAmount >= amount && amount > 0) return 'fully_paid';
  if (paidAmount > 0) return 'partially_paid';
  return state === 'posted' ? 'invoice_issued' : 'due';
}

function optionFromRecord(record: OdooRecord, fallbackPrefix: string): OdooSetupOption {
  const label = getString(record.display_name)
    ?? getString(record.name)
    ?? getString(record.code)
    ?? `${fallbackPrefix} #${record.id}`;
  return { id: record.id, label };
}

function asOdooRecords(value: unknown): OdooRecord[] {
  return Array.isArray(value)
    ? value.filter((record): record is OdooRecord => Boolean(record) && typeof record === 'object' && typeof (record as OdooRecord).id === 'number')
    : [];
}

function buildProductSearchDomain(input: {
  term: string;
  searchableFields: string[];
  categoryIds: number[];
}) {
  const domain = buildOdooCategoryDomain(input.categoryIds);
  if (!input.term) return domain;

  const searchDomain: XmlRpcValue[] = input.searchableFields.length === 1
    ? [[input.searchableFields[0], 'ilike', input.term]]
    : [
        ...Array.from({ length: input.searchableFields.length - 1 }, () => '|'),
        ...input.searchableFields.map((field) => [field, 'ilike', input.term]),
      ];
  return [...domain, ...searchDomain];
}

async function searchProductTemplatesAsVariants(input: {
  client: OdooClient;
  term: string;
  categoryIds: number[];
  limit: number;
}): Promise<OdooRecord[]> {
  const fields = await input.client.fieldsGet('product.template');
  const searchableFields = [
    ...(fields.display_name ? ['display_name'] : []),
    'name',
    ...(fields.default_code ? ['default_code'] : []),
  ];
  const readFields = [
    'id',
    'name',
    ...(fields.default_code ? ['default_code'] : []),
    ...(fields.display_name ? ['display_name'] : []),
    ...(fields.product_variant_id ? ['product_variant_id'] : []),
    ...(fields.categ_id ? ['categ_id'] : []),
  ];
  const categoryIds = fields.categ_id ? input.categoryIds : [];
  const domain = buildProductSearchDomain({ term: input.term, searchableFields, categoryIds });
  const templates = asOdooRecords(
    await input.client.searchRead('product.template', domain, readFields, input.limit),
  );

  const rows: OdooRecord[] = [];
  for (const template of templates) {
    const variantId = getMany2OneId(template.product_variant_id);
    if (variantId) {
      rows.push({ ...template, id: variantId });
      continue;
    }
    const variants = asOdooRecords(await input.client.searchRead('product.product', [['product_tmpl_id', '=', template.id]], ['id'], 1));
    if (variants[0]?.id) rows.push({ ...template, id: variants[0].id });
  }
  return rows;
}

function getOdooUrl(settings: OdooSettings, model: string, id: number) {
  return `${settings.url}/web#id=${id}&model=${encodeURIComponent(model)}&view_type=form`;
}

function getInvoiceRef(invoice: Invoice) {
  return `Renttal:${invoice.invoice_number}`;
}

function partnerReference(seed: string) {
  return `RENTTAL-CUSTOMER-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20).toUpperCase()}`;
}

async function findOrCreatePartner(client: OdooClient, tenant: Tenant): Promise<number> {
  if (tenant.odoo_partner_id) return tenant.odoo_partner_id;

  const fields = await client.fieldsGet('res.partner');
  const externalReference = `RENTTAL-TENANT-${tenant.id}`;
  if (fields.ref) {
    const byReference = await client.searchRead('res.partner', [['ref', '=', externalReference]], ['id', 'name'], 1);
    if (byReference[0]) return byReference[0].id;
  }
  if (tenant.vat) {
    const byVat = await client.searchRead('res.partner', [['vat', '=', tenant.vat]], ['id', 'name'], 1);
    if (byVat[0]) return byVat[0].id;
  }
  if (tenant.email) {
    const byEmail = await client.searchRead('res.partner', [
      ['name', '=', tenant.full_name],
      ['email', '=ilike', tenant.email],
    ], ['id', 'name'], 1);
    if (byEmail[0]) return byEmail[0].id;
  }

  const values: Record<string, string | number | boolean | null> = {
    name: tenant.full_name,
    phone: tenant.phone,
    email: tenant.email,
    vat: tenant.vat,
    street: tenant.street,
    city: tenant.city,
    customer_rank: 1,
  };
  if (fields.ref) values.ref = externalReference;
  if (tenant.country_code) {
    const countries = await client.searchRead('res.country', [['code', '=', tenant.country_code]], ['id'], 1);
    if (countries[0]) values.country_id = countries[0].id;
  }
  return client.create('res.partner', values);
}

async function findOrCreatePartnerFromInput(client: OdooClient, input: {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  vat?: string | null;
  street?: string | null;
  city?: string | null;
  country_code?: string | null;
}): Promise<number> {
  const fields = await client.fieldsGet('res.partner');
  const externalReference = partnerReference([
    input.full_name.trim().toLowerCase(),
    input.vat?.trim() ?? '',
    input.email?.trim().toLowerCase() ?? '',
    input.phone?.trim() ?? '',
    input.national_id?.trim() ?? '',
  ].join('|'));
  if (fields.ref) {
    const byReference = await client.searchRead('res.partner', [['ref', '=', externalReference]], ['id', 'name'], 1);
    if (byReference[0]) return byReference[0].id;
  }
  if (input.vat) {
    const byVat = await client.searchRead('res.partner', [['vat', '=', input.vat]], ['id', 'name'], 1);
    if (byVat[0]) return byVat[0].id;
  }
  if (input.email) {
    const byEmail = await client.searchRead('res.partner', [
      ['name', '=', input.full_name],
      ['email', '=ilike', input.email],
    ], ['id', 'name'], 1);
    if (byEmail[0]) return byEmail[0].id;
  }

  const values: Record<string, string | number | boolean | null> = {
    name: input.full_name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    vat: input.vat ?? null,
    street: input.street ?? null,
    city: input.city ?? null,
    customer_rank: 1,
  };
  if (fields.ref) values.ref = externalReference;
  if (input.country_code) {
    const countries = await client.searchRead('res.country', [['code', '=', input.country_code]], ['id'], 1);
    if (countries[0]) values.country_id = countries[0].id;
  }
  return client.create('res.partner', values);
}

async function getInvoiceState(client: OdooClient, id: number) {
  const rows = await client.read('account.move', [id], ['id', 'name', 'state', 'payment_state']);
  return rows[0] ?? null;
}

async function getProductVariantId(client: OdooClient, templateId: number) {
  const template = (await client.read('product.template', [templateId], ['id', 'product_variant_id']))[0];
  const variantId = getMany2OneId(template?.product_variant_id);
  if (variantId) return variantId;

  const variants = await client.searchRead('product.product', [['product_tmpl_id', '=', templateId]], ['id'], 1);
  if (variants[0]?.id) return variants[0].id;

  throw new Error(`Could not find Odoo product variant for product.template(${templateId})`);
}

function buildLineValues(settings: OdooSettings, contract: Contract, invoice: Invoice, unit: Unit) {
  const snapshots: Array<Pick<
    InvoiceLine,
    'description' | 'odoo_product_id' | 'amount_untaxed' | 'tax_rate' | 'line_type' | 'sort_order'
  >> = invoice.lines?.length
    ? [...invoice.lines].sort((a, b) => a.sort_order - b.sort_order)
    : [{
        description: `${unit.unit_number} - ${contract.contract_number}`,
        odoo_product_id: unit.odoo_product_id,
        amount_untaxed: Number(invoice.amount_untaxed ?? invoice.amount),
        tax_rate: contract.tax_mode === 'taxable' ? settings.vatRate : 0,
        line_type: 'rental',
        sort_order: 0,
      }];

  return snapshots.map((snapshot) => {
    const productId = snapshot.odoo_product_id
      ?? (snapshot.line_type === 'rental' ? unit.odoo_product_id : null);
    if (!productId) throw new Error('Invoice line is not linked to an Odoo product');
    if (Number(snapshot.tax_rate) > 0 && !settings.vatTaxId) {
      throw new Error('Taxable invoice line requires an Odoo VAT tax setting');
    }

    const line: Record<string, XmlRpcValue> = {
      product_id: productId,
      name: snapshot.description || `${unit.unit_number} - ${contract.contract_number}`,
      quantity: 1,
      price_unit: Number(snapshot.amount_untaxed),
      tax_ids: [[6, 0, Number(snapshot.tax_rate) > 0 && settings.vatTaxId ? [settings.vatTaxId] : []]],
    };
    if (settings.incomeAccountId) line.account_id = settings.incomeAccountId;
    if (settings.startDateField) line[settings.startDateField] = invoice.period_start;
    if (settings.endDateField) line[settings.endDateField] = invoice.period_end;
    if (unit.location?.odoo_analytic_account_id) {
      line.analytic_distribution = {
        [String(unit.location.odoo_analytic_account_id)]: 100,
      };
    }
    return line;
  });
}

async function upsertOdooInvoice(input: {
  client: OdooClient;
  settings: OdooSettings;
  contract: Contract;
  invoice: Invoice;
  partnerId: number;
  unit: Unit;
}) {
  const { client, settings, contract, invoice, partnerId, unit } = input;
  const lineValues = buildLineValues(settings, contract, invoice, unit);
  const lineCommands = lineValues.map((line) => [0, 0, line] as XmlRpcValue[]);
  const values: Record<string, XmlRpcValue> = {
    move_type: 'out_invoice',
    partner_id: partnerId,
    invoice_date: invoice.period_start,
    invoice_date_due: invoice.due_date,
    ref: getInvoiceRef(invoice),
    invoice_line_ids: lineCommands,
  };
  if (settings.journalId) values.journal_id = settings.journalId;
  if (settings.companyId) values.company_id = settings.companyId;

  if (!invoice.odoo_invoice_id) {
    const existing = await client.searchRead('account.move', [
      ['move_type', '=', 'out_invoice'],
      ['ref', '=', getInvoiceRef(invoice)],
    ], ['id', 'name', 'state'], 1);
    const odooInvoiceId = existing[0]?.id ?? await client.create('account.move', values);
    const state = await getInvoiceState(client, odooInvoiceId);
    return {
      id: odooInvoiceId,
      name: typeof state?.name === 'string' ? state.name : String(odooInvoiceId),
      state: typeof state?.state === 'string' ? state.state : 'draft',
    };
  }

  const current = await getInvoiceState(client, invoice.odoo_invoice_id);
  if (current && current.state !== 'draft') {
    return {
      id: invoice.odoo_invoice_id,
      name: typeof current.name === 'string' ? current.name : invoice.odoo_invoice_name,
      state: typeof current.state === 'string' ? current.state : invoice.odoo_invoice_state,
      needsReview: true,
    };
  }

  await client.write('account.move', [invoice.odoo_invoice_id], {
    partner_id: partnerId,
    invoice_date: invoice.period_start,
    invoice_date_due: invoice.due_date,
    ref: getInvoiceRef(invoice),
    invoice_line_ids: [[5, 0, 0], ...lineCommands],
  });
  const state = await getInvoiceState(client, invoice.odoo_invoice_id);
  return {
    id: invoice.odoo_invoice_id,
    name: typeof state?.name === 'string' ? state.name : invoice.odoo_invoice_name,
    state: typeof state?.state === 'string' ? state.state : 'draft',
  };
}

export const odooService = {
  async getSetupOptions(auth: AuthContext, ctx: LogContext, overrides?: Partial<OdooSettings>): Promise<OdooSetupOptions> {
    const current = await getOdooSettings(ctx);
    const settings = createRuntimeSettings(current, { ...overrides, enabled: true });
    const client = new OdooClient(settings);
    const uid = await client.getUid();
    const diagnostics: OdooSetupOptions['diagnostics'] = [];

    async function safeSearchRead(model: string, domain: XmlRpcValue[], fields: string[], limit: number) {
      try {
        const records = asOdooRecords(await client.searchRead(model, domain, fields, limit));
        diagnostics.push({ model, operation: 'search_read', ok: true, count: records.length });
        return records;
      } catch (error) {
        diagnostics.push({ model, operation: 'search_read', ok: false, message: messageFromError(error) });
        return [];
      }
    }

    async function safeFieldsGet(model: string) {
      try {
        const fields = await client.fieldsGet(model);
        diagnostics.push({ model, operation: 'fields_get', ok: true, count: Object.keys(fields).length });
        return fields;
      } catch (error) {
        diagnostics.push({ model, operation: 'fields_get', ok: false, message: messageFromError(error) });
        return {};
      }
    }

    const [companyFields, journalFields, taxFields, accountFields, categoryFields, lineFields] = await Promise.all([
      safeFieldsGet('res.company'),
      safeFieldsGet('account.journal'),
      safeFieldsGet('account.tax'),
      safeFieldsGet('account.account'),
      safeFieldsGet('product.category'),
      safeFieldsGet('account.move.line'),
    ]);

    const journalDomain: XmlRpcValue[] = journalFields.type ? [['type', '=', 'sale']] : [];
    const taxDomain: XmlRpcValue[] = taxFields.type_tax_use ? [['type_tax_use', 'in', ['sale', 'all']]] : [];
    const accountDomain: XmlRpcValue[] = accountFields.deprecated ? [['deprecated', '=', false]] : [];
    const accountReadFields = [
      'id',
      'name',
      ...(accountFields.code ? ['code'] : []),
      ...(accountFields.account_type ? ['account_type'] : []),
      ...(accountFields.display_name ? ['display_name'] : []),
    ];

    const companyReadFields = ['id', 'name', ...(companyFields.display_name ? ['display_name'] : [])];
    const journalReadFields = [
      'id',
      'name',
      ...(journalFields.code ? ['code'] : []),
      ...(journalFields.display_name ? ['display_name'] : []),
    ];
    const taxReadFields = [
      'id',
      'name',
      ...(taxFields.amount ? ['amount'] : []),
      ...(taxFields.display_name ? ['display_name'] : []),
    ];

    const categoryReadFields = ['id', 'name', ...(categoryFields.display_name ? ['display_name'] : [])];

    const [loadedCompanies, journals, taxes, incomeAccounts, productCategories] = await Promise.all([
      safeSearchRead('res.company', [], companyReadFields, 50),
      safeSearchRead('account.journal', journalDomain, journalReadFields, 50),
      safeSearchRead('account.tax', taxDomain, taxReadFields, 80),
      safeSearchRead('account.account', accountDomain, accountReadFields, 120),
      safeSearchRead('product.category', [], categoryReadFields, 80),
    ]);

    let companies = loadedCompanies;
    if (companies.length === 0) {
      const users = await safeSearchRead('res.users', [['id', '=', uid]], ['id', 'company_id'], 1);
      const companyId = getMany2OneId(users[0]?.company_id);
      const companyName = getMany2OneName(users[0]?.company_id);
      if (companyId) {
        companies = [{ id: companyId, name: companyName ?? `Company #${companyId}` }];
      }
    }

    const saleTaxes = taxes
      .filter((tax) => {
        const amount = Number(tax.amount);
        const name = String(tax.name ?? tax.display_name ?? '');
        return Math.abs(amount - 15) < 0.001 || name.includes('15');
      })
      .concat(taxes.filter((tax) => {
        const amount = Number(tax.amount);
        const name = String(tax.name ?? tax.display_name ?? '');
        return !(Math.abs(amount - 15) < 0.001 || name.includes('15'));
      }));

    const income = incomeAccounts.filter((account) => {
      const type = String(account.account_type ?? '').toLowerCase();
      const name = String(account.name ?? account.display_name ?? '').toLowerCase();
      return type.includes('income') || type.includes('revenue') || name.includes('income') || name.includes('revenue');
    });

    const dateFields = Object.entries(lineFields)
      .filter(([, field]) => field.type === 'date' || field.type === 'datetime')
      .map(([name, field]) => ({ name, label: field.string ? `${field.string} (${name})` : name }))
      .sort((a, b) => a.label.localeCompare(b.label));

    await logOdoo(auth, 'load_setup_options', 'setting', null, 'synced', null, {
      companies: companies.length,
      journals: journals.length,
      taxes: saleTaxes.length,
      incomeAccounts: income.length || incomeAccounts.length,
      productCategories: productCategories.length,
      dateFields: dateFields.length,
    }, ctx);

    return {
      companies: companies.map((record) => optionFromRecord(record, 'Company')),
      journals: journals.map((record) => optionFromRecord(record, 'Journal')),
      taxes: saleTaxes.map((record) => optionFromRecord(record, 'Tax')),
      incomeAccounts: (income.length > 0 ? income : incomeAccounts).map((record) => optionFromRecord(record, 'Account')),
      productCategories: productCategories.map((record) => optionFromRecord(record, 'Category')),
      dateFields,
      diagnostics,
    };
  },

  async testConnection(auth: AuthContext, ctx: LogContext, overrides?: Partial<OdooSettings>): Promise<TestResult> {
    const current = await getOdooSettings(ctx);
    const settings = createRuntimeSettings(current, overrides);
    const client = new OdooClient(settings);
    try {
      await client.authenticate();
      const details: Record<string, unknown> = {};
      for (const model of ['res.partner', 'product.product', 'product.template', 'account.move', 'account.move.line']) {
        details[model] = Boolean(await client.fieldsGet(model, ['id']));
      }
      const lineFields = await client.fieldsGet('account.move.line');
      details.startDateField = Boolean(lineFields[settings.startDateField]);
      details.endDateField = Boolean(lineFields[settings.endDateField]);
      details.analyticDistribution = Boolean(lineFields.analytic_distribution);
      const configuredRecords: Array<{ key: string; model: string; id: number | null; fields: string[] }> = [
        { key: 'company', model: 'res.company', id: settings.companyId, fields: ['id', 'name'] },
        { key: 'journal', model: 'account.journal', id: settings.journalId, fields: ['id', 'name', 'type'] },
        { key: 'vatTax', model: 'account.tax', id: settings.vatTaxId, fields: ['id', 'name', 'amount'] },
        { key: 'incomeAccount', model: 'account.account', id: settings.incomeAccountId, fields: ['id', 'name'] },
        { key: 'productCategory', model: 'product.category', id: settings.productCategoryId, fields: ['id', 'name'] },
        { key: 'serviceCategory', model: 'product.category', id: settings.serviceCategoryId, fields: ['id', 'name'] },
      ];
      for (const configured of configuredRecords) {
        if (!configured.id) continue;
        const rows = await client.read(configured.model, [configured.id], configured.fields);
        if (!rows[0]) throw new Error(`${configured.model}(${configured.id}) does not exist or is not accessible`);
        details[configured.key] = rows[0];
      }
      const rentalCategoryIds = getRentalProductCategoryIds(settings);
      if (rentalCategoryIds.length > 0) {
        details.productCount = (await client.searchReadAll('product.product', [
          ...buildOdooCategoryDomain(rentalCategoryIds),
        ], ['id'], { pageSize: 100, maxRecords: 10_000 })).length;
      }
      if (!details.startDateField || !details.endDateField) {
        throw new Error('Configured Odoo invoice period fields do not exist on account.move.line');
      }
      await logOdoo(auth, 'test_connection', 'setting', null, 'synced', 'Connection OK', details, ctx);
      return { ok: true, message: 'Connection OK', details };
    } catch (error) {
      const message = messageFromError(error);
      await logOdoo(auth, 'test_connection', 'setting', null, 'failed', message, {}, ctx);
      return { ok: false, message, details: {} };
    }
  },

  async createTestDraftInvoice(auth: AuthContext, ctx: LogContext, overrides?: OdooRuntimeOverrides): Promise<TestResult> {
    const current = await getOdooSettings(ctx);
    const settings = createRuntimeSettings(current, { ...overrides, enabled: true });
    const client = new OdooClient(settings);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const partnerId = await client.create('res.partner', {
        name: `Renttal Odoo Test ${today}`,
        customer_rank: 1,
      });
      const lineValues: Record<string, XmlRpcValue> = {
        name: 'Renttal integration test',
        quantity: 1,
        price_unit: 1,
        tax_ids: [[6, 0, settings.vatTaxId ? [settings.vatTaxId] : []]],
      };
      if (overrides?.testProductId) lineValues.product_id = overrides.testProductId;
      if (settings.incomeAccountId) lineValues.account_id = settings.incomeAccountId;
      if (settings.startDateField) lineValues[settings.startDateField] = today;
      if (settings.endDateField) lineValues[settings.endDateField] = today;
      const invoiceId = await client.create('account.move', {
        move_type: 'out_invoice',
        partner_id: partnerId,
        invoice_date: today,
        invoice_date_due: today,
        ref: 'Renttal integration test',
        ...(settings.journalId ? { journal_id: settings.journalId } : {}),
        ...(settings.companyId ? { company_id: settings.companyId } : {}),
        invoice_line_ids: [[0, 0, lineValues]],
      });
      const state = await getInvoiceState(client, invoiceId);
      const details = {
        odoo_invoice_id: invoiceId,
        odoo_invoice_name: state?.name ?? String(invoiceId),
        url: getOdooUrl(settings, 'account.move', invoiceId),
      };
      await logOdoo(auth, 'create_test_draft_invoice', 'setting', null, 'synced', 'Test draft invoice created', details, ctx);
      return { ok: true, message: 'Test draft invoice created', details };
    } catch (error) {
      const message = messageFromError(error);
      await logOdoo(auth, 'create_test_draft_invoice', 'setting', null, 'failed', message, {}, ctx);
      return { ok: false, message, details: {} };
    }
  },

  async searchProducts(
    auth: AuthContext,
    query: string,
    ctx: LogContext,
    limit = 500,
    category: 'rental' | 'service' = 'rental',
  ): Promise<OdooProductCatalogRow[]> {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const term = query.trim();
    const fields = await client.fieldsGet('product.product');
    const searchableFields = [
      ...(fields.display_name ? ['display_name'] : []),
      'name',
      ...(fields.default_code ? ['default_code'] : []),
    ];
    const configuredCategoryIds = category === 'service'
      ? (settings.serviceCategoryId ? [settings.serviceCategoryId] : [])
      : getRentalProductCategoryIds(settings);
    const categoryIds = fields.categ_id ? configuredCategoryIds : [];
    if (category === 'service' && categoryIds.length === 0) return [];
    const readFields = [
      'id',
      'name',
      ...(fields.default_code ? ['default_code'] : []),
      ...(fields.display_name ? ['display_name'] : []),
      ...(fields.categ_id ? ['categ_id'] : []),
      ...(fields.description_sale ? ['description_sale'] : []),
      ...(fields.description ? ['description'] : []),
      ...(fields.categ_id ? ['categ_id'] : []),
      ...(fields.description_sale ? ['description_sale'] : []),
      ...(fields.description ? ['description'] : []),
    ];
    const cappedLimit = Math.min(Math.max(limit, 1), 5_000);
    const numericId = /^\d+$/.test(term) ? Number(term) : null;
    const domain = numericId
      ? [
          ...buildOdooCategoryDomain(categoryIds),
          ['id', '=', numericId],
        ] as XmlRpcValue[]
      : buildProductSearchDomain({ term, searchableFields, categoryIds });
    let products = asOdooRecords(await client.searchReadAll(
      'product.product',
      domain,
      readFields,
      { pageSize: Math.min(cappedLimit, 200), maxRecords: cappedLimit },
    ));
    if (products.length === 0) {
      products = await searchProductTemplatesAsVariants({
        client,
        term,
        categoryIds: configuredCategoryIds,
        limit: cappedLimit,
      });
    }

    if (category === 'service') {
      return products.map((product) => toProductCatalogRow(product));
    }

    const locations = await locationsRepository.findAll(ctx);
    const locationByAnalytic = new Map(locations
      .filter((location) => location.odoo_analytic_account_id != null)
      .map((location) => [
        String(location.odoo_analytic_account_id),
        { id: location.id, name: location.name_en || location.name_ar },
      ]));
    const suggestions = new Map<number, { id: string; name: string }>();
    if (products.length > 0 && locationByAnalytic.size > 0 && fields.id) {
      try {
        const lineFields = await client.fieldsGet('account.move.line');
        if (lineFields.analytic_distribution) {
          const recentLines = await client.searchReadAll('account.move.line', [
            ['product_id', 'in', products.map((product) => product.id)],
            ['analytic_distribution', '!=', false],
          ], ['id', 'product_id', 'analytic_distribution'], {
            pageSize: 250,
            maxRecords: 5_000,
            order: 'id desc',
          });
          const counts = new Map<number, Map<string, number>>();
          for (const line of recentLines) {
            const productId = getMany2OneId(line.product_id);
            if (!productId || !line.analytic_distribution || typeof line.analytic_distribution !== 'object') continue;
            const productCounts = counts.get(productId) ?? new Map<string, number>();
            for (const key of Object.keys(line.analytic_distribution as Record<string, unknown>)) {
              const analyticIds = key.split(',').map((value) => value.trim());
              for (const analyticId of analyticIds) {
                if (locationByAnalytic.has(analyticId)) {
                  productCounts.set(analyticId, (productCounts.get(analyticId) ?? 0) + 1);
                }
              }
            }
            counts.set(productId, productCounts);
          }
          for (const product of products) {
            const top = [...(counts.get(product.id)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0];
            const location = top ? locationByAnalytic.get(top[0]) : null;
            if (location) suggestions.set(product.id, location);
          }
        }
      } catch (error) {
        await logOdoo(auth, 'suggest_product_locations', 'unit', null, 'needs_review', messageFromError(error), {}, ctx);
      }
    }
    return products.map((product) => toProductCatalogRow(product, suggestions.get(product.id)));
  },

  async syncServiceProductCatalog(
    auth: AuthContext,
    ctx: LogContext,
  ): Promise<{ success: true; count: number; lastSyncedAt: string } | { success: false; error: string }> {
    const settings = await getOdooSettings(ctx);
    if (!settings.serviceCategoryId) {
      return { success: false, error: 'serviceCategoryNotConfigured' };
    }

    try {
      const products = await odooService.searchProducts(auth, '', ctx, 5_000, 'service');
      const lastSyncedAt = new Date().toISOString();
      const count = await odooServiceProductsRepository.syncCategory(
        settings.serviceCategoryId,
        products.map((product) => ({
          id: product.id,
          name: product.name,
          display_name: product.display_name,
          default_code: product.default_code,
          description: product.description,
          category_name: product.category_name,
        })),
        lastSyncedAt,
        ctx,
      );
      await logOdoo(
        auth,
        'sync_service_product_catalog',
        'service_product',
        null,
        'synced',
        null,
        { categoryId: settings.serviceCategoryId, productCount: count },
        ctx,
      );
      return { success: true, count, lastSyncedAt };
    } catch (error) {
      await logOdoo(
        auth,
        'sync_service_product_catalog',
        'service_product',
        null,
        'failed',
        messageFromError(error),
        { categoryId: settings.serviceCategoryId },
        ctx,
      );
      return { success: false, error: 'serviceProductSyncFailed' };
    }
  },

  async syncLinkedUnitDetails(
    auth: AuthContext,
    products: OdooProductCatalogRow[],
    ctx: LogContext,
  ) {
    const productsById = new Map(products.map((product) => [product.id, product]));
    const linkedUnits = (await unitsRepository.findAll(ctx)).filter((unit) => (
      unit.odoo_product_id != null && productsById.has(unit.odoo_product_id)
    ));
    let updatedCount = 0;
    let errorCount = 0;

    for (const unit of linkedUnits) {
      const product = productsById.get(unit.odoo_product_id as number);
      if (!product) continue;
      const odooName = product.name.trim();
      const needsUpdate = unit.unit_number !== odooName
        || unit.odoo_product_reference !== product.default_code
        || unit.odoo_product_name !== odooName
        || unit.odoo_product_display_name !== product.display_name
        || unit.odoo_product_description !== product.description
        || unit.odoo_product_category_id !== product.category_id
        || unit.odoo_product_category_name !== product.category_name;
      if (!needsUpdate) continue;
      try {
        await unitsRepository.update(unit.id, {
          unit_number: odooName,
          odoo_product_reference: product.default_code,
          odoo_product_name: odooName,
          odoo_product_display_name: product.display_name,
          odoo_product_description: product.description,
          odoo_product_category_id: product.category_id,
          odoo_product_category_name: product.category_name,
          odoo_sync_status: 'synced',
          odoo_last_sync_at: new Date().toISOString(),
        }, ctx);
        updatedCount++;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        errorCount++;
      }
    }

    await logOdoo(
      auth,
      'sync_linked_unit_details',
      'unit',
      null,
      errorCount > 0 ? 'needs_review' : 'synced',
      errorCount > 0 ? `${errorCount} linked unit detail update(s) conflicted locally` : null,
      { linkedCount: linkedUnits.length, updatedCount, errorCount },
      ctx,
    );
    return { updatedCount, errorCount };
  },

  async previewLocationProducts(auth: AuthContext, locationId: string, query: string | undefined, ctx: LogContext): Promise<OdooLocationProductImportResult> {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const location = await locationsRepository.findById(locationId, ctx);
    if (!location) throw new Error('locationNotFound');

    const term = (query?.trim() || location.name_en || location.name_ar).trim();
    if (!term) return { rows: [], totalRows: 0 };

    const fields = await client.fieldsGet('product.product');
    const searchableFields = [
      ...(fields.display_name ? ['display_name'] : []),
      'name',
      ...(fields.default_code ? ['default_code'] : []),
    ];
    const readFields = [
      'id',
      'name',
      ...(fields.default_code ? ['default_code'] : []),
      ...(fields.display_name ? ['display_name'] : []),
    ];
    const domain: XmlRpcValue[] = searchableFields.length === 1
      ? [[searchableFields[0], 'ilike', term]]
      : [
          ...Array.from({ length: searchableFields.length - 1 }, () => '|'),
          ...searchableFields.map((field) => [field, 'ilike', term]),
        ];
    const [rawProducts, localUnits] = await Promise.all([
      client.searchRead('product.product', domain, readFields, 80),
      unitsRepository.findAll(ctx, { locationId }),
    ]);
    const products = asOdooRecords(rawProducts);
    const existingProductIds = new Set(localUnits.map((unit) => unit.odoo_product_id).filter(Boolean));
    const existingUnitNumbers = new Set(localUnits.map((unit) => unit.unit_number.trim().toLowerCase()));

    const rows = products.map((product) => {
      const displayName = getProductLabel(product);
      const unitNumber = getOdooProductName(product);
      const exists = existingProductIds.has(product.id) || existingUnitNumbers.has(unitNumber.trim().toLowerCase());
      const errors: string[] = [];
      if (!unitNumber.trim()) errors.push('unitNumberMissing');
      return {
        odooProductId: product.id,
        name: getOdooProductName(product),
        displayName,
        defaultCode: getString(product.default_code),
        description: getProductDescription(product),
        categoryId: getMany2OneId(product.categ_id),
        categoryName: getMany2OneName(product.categ_id),
        unitNumber,
        exists,
        valid: errors.length === 0,
        errors,
      };
    });

    return { rows, totalRows: rows.length };
  },

  async importLocationProducts(auth: AuthContext, locationId: string, rows: OdooLocationProductImportRow[], ctx: LogContext) {
    const location = await locationsRepository.findById(locationId, ctx);
    if (!location) return { success: false, error: 'locationNotFound', createdCount: 0, skippedCount: 0, errors: ['locationNotFound'] };

    const localUnits = await unitsRepository.findAll(ctx, { locationId });
    const existingProductIds = new Set(localUnits.map((unit) => unit.odoo_product_id).filter(Boolean));
    const existingUnitNumbers = new Set(localUnits.map((unit) => unit.unit_number.trim().toLowerCase()));
    let createdCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const unitNumber = row.unitNumber.trim();
      if (!row.valid || !unitNumber) {
        skippedCount++;
        continue;
      }
      if (existingProductIds.has(row.odooProductId) || existingUnitNumbers.has(unitNumber.toLowerCase())) {
        skippedCount++;
        continue;
      }

      try {
        await unitsRepository.create({
          location_id: locationId,
          unit_number: unitNumber,
          status: 'vacant',
          odoo_product_id: row.odooProductId,
          odoo_product_reference: row.defaultCode,
          odoo_product_name: row.name,
          odoo_product_display_name: row.displayName,
          odoo_product_description: row.description,
          odoo_product_category_id: row.categoryId,
          odoo_product_category_name: row.categoryName,
          odoo_sync_status: 'synced',
          odoo_last_sync_at: new Date().toISOString(),
        }, ctx);
        existingProductIds.add(row.odooProductId);
        existingUnitNumbers.add(unitNumber.toLowerCase());
        createdCount++;
      } catch (error) {
        errors.push(`${row.displayName}: ${messageFromError(error)}`);
      }
    }

    await logOdoo(auth, 'import_location_products', 'location', locationId, errors.length ? 'needs_review' : 'synced', null, {
      createdCount,
      skippedCount,
      errorCount: errors.length,
    }, ctx);

    return { success: true, createdCount, skippedCount, errors };
  },

  async searchPartners(auth: AuthContext, query: string, ctx: LogContext): Promise<OdooRecord[]> {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const term = query.trim();
    if (!term) return [];
    const partners = await client.searchRead('res.partner', [
      ['active', '=', true],
      ['customer_rank', '>', 0],
      '|',
      '|',
      '|',
      ['name', 'ilike', term],
      ['phone', 'ilike', term],
      ['email', 'ilike', term],
      ['vat', 'ilike', term],
    ], ['id', 'name', 'phone', 'email', 'vat', 'street', 'city', 'country_id', 'display_name'], 20);
    const countryIds = Array.from(new Set(partners
      .map((partner) => getMany2OneId(partner.country_id))
      .filter((id): id is number => id != null)));

    if (countryIds.length === 0) return partners;

    const countries = await client.read('res.country', countryIds, ['id', 'code']);
    const countryCodeById = new Map(countries.map((country) => [country.id, getString(country.code)]));

    return partners.map((partner) => {
      const countryId = getMany2OneId(partner.country_id);
      return {
        ...partner,
        country_code: countryId ? countryCodeById.get(countryId) ?? null : null,
      };
    });
  },

  async searchAnalyticAccounts(auth: AuthContext, query: string, ctx: LogContext): Promise<OdooRecord[]> {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const term = query.trim();
    if (!term) return [];

    const fields = await client.fieldsGet('account.analytic.account');
    const hasCode = Boolean(fields.code);
    const readFields = [
      'id',
      'name',
      ...(hasCode ? ['code'] : []),
      ...(fields.display_name ? ['display_name'] : []),
    ];
    const searchableFields = [
      'name',
      ...(hasCode ? ['code'] : []),
      ...(fields.display_name ? ['display_name'] : []),
    ];
    const domain = searchableFields.length === 1
      ? [[searchableFields[0], 'ilike', term]]
      : [
          ...Array.from({ length: searchableFields.length - 1 }, () => '|'),
          ...searchableFields.map((field) => [field, 'ilike', term]),
        ];

    const directResults = await client.searchRead('account.analytic.account', domain, readFields, 20);
    if (directResults.length > 0) return directResults;

    const loweredTerm = term.toLowerCase();
    const candidates = await client.searchRead('account.analytic.account', [], readFields, 200);
    return candidates
      .filter((record) => readFields.some((field) => String(record[field] ?? '').toLowerCase().includes(loweredTerm)))
      .slice(0, 20);
  },

  async findOrCreatePartnerForTenant(auth: AuthContext, input: {
    full_name: string;
    phone?: string | null;
    email?: string | null;
    national_id?: string | null;
    vat?: string | null;
    street?: string | null;
    city?: string | null;
    country_code?: string | null;
  }, ctx: LogContext) {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    try {
      const partnerId = await findOrCreatePartnerFromInput(client, input);
      await logOdoo(auth, 'find_or_create_partner', 'tenant', null, 'synced', null, { partner_id: partnerId }, ctx);
      return { success: true, data: partnerId };
    } catch (error) {
      const message = messageFromError(error);
      await logOdoo(auth, 'find_or_create_partner', 'tenant', null, 'failed', message, {}, ctx);
      return { success: false, error: message };
    }
  },

  async previewLegacyInvoices(auth: AuthContext, ctx: LogContext, input?: { limit?: number }): Promise<OdooLegacyImportResult> {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);

    const [moves, units, localInvoices] = await Promise.all([
      client.searchRead('account.move', [
        ['move_type', '=', 'out_invoice'],
        ['state', 'in', ['draft', 'posted']],
      ], [
        'id',
        'name',
        'ref',
        'state',
        'payment_state',
        'partner_id',
        'invoice_date',
        'invoice_date_due',
        'amount_total',
        'amount_residual',
        'invoice_line_ids',
      ], limit),
      unitsRepository.findAll(ctx),
      invoicesRepository.findAll(ctx),
    ]);

    const invoiceLineIds = moves.flatMap((move) => Array.isArray(move.invoice_line_ids)
      ? move.invoice_line_ids.filter((id): id is number => typeof id === 'number')
      : []);
    const lines = invoiceLineIds.length > 0
      ? await client.read('account.move.line', invoiceLineIds, [
          'id',
          'move_id',
          'product_id',
          'name',
          'price_total',
          'price_subtotal',
          settings.startDateField,
          settings.endDateField,
        ])
      : [];

    const linesByMove = new Map<number, OdooRecord[]>();
    for (const line of lines) {
      const moveId = getMany2OneId(line.move_id);
      if (!moveId) continue;
      const moveLines = linesByMove.get(moveId) ?? [];
      moveLines.push(line);
      linesByMove.set(moveId, moveLines);
    }

    const unitsByProduct = new Map<number, Unit>();
    for (const unit of units) {
      if (unit.odoo_product_id) unitsByProduct.set(unit.odoo_product_id, unit);
    }

    const existingOdooInvoiceIds = new Set(
      localInvoices
        .map((invoice) => invoice.odoo_invoice_id)
        .filter((id): id is number => typeof id === 'number')
    );
    const existingInvoiceNumbers = new Set(localInvoices.map((invoice) => invoice.invoice_number));
    const existingUnitPeriods = new Set(localInvoices.map((invoice) => `${invoice.unit_id}:${invoice.period_start}:${invoice.period_end}`));

    const partnerIds = Array.from(new Set(moves.map((move) => getMany2OneId(move.partner_id)).filter((id): id is number => Boolean(id))));
    const [partners, localTenants] = await Promise.all([
      partnerIds.length > 0
        ? client.read('res.partner', partnerIds, ['id', 'name', 'phone', 'email', 'vat', 'street', 'city', 'country_id'])
        : Promise.resolve([]),
      Promise.all(partnerIds.map((id) => tenantsRepository.findByOdooPartnerId(id, ctx))),
    ]);
    const partnersById = new Map(partners.map((partner) => [partner.id, partner]));
    const tenantsByPartnerId = new Map<number, Tenant>();
    localTenants.forEach((tenant, index) => {
      const partnerId = partnerIds[index];
      if (tenant && partnerId) tenantsByPartnerId.set(partnerId, tenant);
    });

    const rows: OdooLegacyImportRow[] = moves.map((move) => {
      const moveLines = linesByMove.get(move.id) ?? [];
      const rentalLines = moveLines.filter((line) => {
        const productId = getMany2OneId(line.product_id);
        return productId ? unitsByProduct.has(productId) : false;
      });
      const line = rentalLines[0] ?? moveLines[0] ?? null;
      const productId = line ? getMany2OneId(line.product_id) : null;
      const unit = productId ? unitsByProduct.get(productId) ?? null : null;
      const partnerId = getMany2OneId(move.partner_id);
      const partner = partnerId ? partnersById.get(partnerId) ?? null : null;
      const tenant = partnerId ? tenantsByPartnerId.get(partnerId) ?? null : null;
      const amount = getNumber(line?.price_total ?? move.amount_total);
      const residual = getNumber(move.amount_residual);
      const paidAmount = Math.max(0, Math.min(amount, getNumber(move.amount_total) - residual));
      const state = getString(move.state) ?? 'draft';
      const paymentState = getString(move.payment_state);
      const periodStart = normalizeOdooDate(line?.[settings.startDateField] ?? move.invoice_date);
      const periodEnd = normalizeOdooDate(line?.[settings.endDateField] ?? move.invoice_date_due ?? move.invoice_date);
      const contractNumber = extractContractNumber(getString(move.ref), getString(line?.name));
      const invoiceName = getString(move.name) ?? String(move.id);
      const errors: string[] = [];

      if (rentalLines.length > 1) errors.push('multipleMatchedUnitLines');
      if (!unit) errors.push('unitProductNotLinked');
      if (!partnerId) errors.push('partnerMissing');
      if (!contractNumber) errors.push('contractNumberMissing');
      if (!periodStart || !periodEnd) errors.push('periodMissing');
      if (periodStart && periodEnd && periodEnd < periodStart) errors.push('periodInvalid');
      if (existingOdooInvoiceIds.has(move.id)) errors.push('duplicateOdooInvoice');
      if (existingInvoiceNumbers.has(invoiceName)) errors.push('duplicateInvoiceNumber');
      if (unit && periodStart && periodEnd && existingUnitPeriods.has(`${unit.id}:${periodStart}:${periodEnd}`)) {
        errors.push('duplicateUnitPeriod');
      }

      return {
        odooInvoiceId: move.id,
        odooInvoiceName: invoiceName,
        odooInvoiceState: state,
        odooPaymentState: paymentState,
        contractNumber,
        unitId: unit?.id ?? null,
        unitNumber: unit?.unit_number ?? null,
        tenantId: tenant?.id ?? null,
        tenantName: tenant?.full_name ?? getString(partner?.name) ?? getMany2OneName(move.partner_id) ?? '—',
        tenantOdooPartnerId: partnerId,
        tenantPhone: tenant?.phone ?? getString(partner?.phone),
        tenantEmail: tenant?.email ?? getString(partner?.email),
        tenantVat: tenant?.vat ?? getString(partner?.vat),
        tenantStreet: tenant?.street ?? getString(partner?.street),
        tenantCity: tenant?.city ?? getString(partner?.city),
        tenantCountryCode: tenant?.country_code ?? null,
        periodStart,
        periodEnd,
        dueDate: normalizeOdooDate(move.invoice_date_due ?? move.invoice_date),
        invoiceDate: normalizeOdooDate(move.invoice_date),
        amount,
        paidAmount,
        status: statusFromOdoo(state, paymentState, amount, paidAmount),
        paymentCycle: null,
        valid: errors.length === 0,
        errors,
      };
    });

    const grouped = new Map<string, OdooLegacyImportRow[]>();
    for (const row of rows) {
      if (!row.contractNumber || !row.unitId || !row.tenantOdooPartnerId || !row.periodStart || !row.periodEnd) continue;
      const key = `${row.contractNumber}:${row.unitId}:${row.tenantOdooPartnerId}`;
      const group = grouped.get(key) ?? [];
      group.push(row);
      grouped.set(key, group);
    }

    for (const group of grouped.values()) {
      const cycle = inferPaymentCycleFromPeriods(group.map((row) => ({
        periodStart: row.periodStart as string,
        periodEnd: row.periodEnd as string,
      })));
      for (const row of group) {
        row.paymentCycle = cycle;
        if (!cycle) {
          row.errors.push('paymentCycleUnknown');
          row.valid = false;
        } else {
          row.valid = row.errors.length === 0;
        }
      }
    }

    return { rows, totalRows: moves.length };
  },

  async importLegacyInvoices(auth: AuthContext, rows: OdooLegacyImportRow[], ctx: LogContext) {
    const validRows = rows.filter((row) => row.valid);
    const errors: Array<{ odooInvoiceId: number; message: string }> = [];
    let invoiceCount = 0;
    let contractCount = 0;
    let skippedCount = 0;

    const groups = new Map<string, OdooLegacyImportRow[]>();
    for (const row of validRows) {
      if (!row.contractNumber || !row.unitId || !row.tenantOdooPartnerId || !row.periodStart || !row.periodEnd || !row.paymentCycle) {
        errors.push({ odooInvoiceId: row.odooInvoiceId, message: 'Row is missing required data' });
        continue;
      }
      const key = `${row.contractNumber}:${row.unitId}:${row.tenantOdooPartnerId}`;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }

    for (const groupRows of groups.values()) {
      const first = groupRows[0];
      if (!first?.contractNumber || !first.unitId || !first.paymentCycle) continue;

      const sorted = [...groupRows].sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)));
      const startDate = sorted[0].periodStart as string;
      const endDate = sorted[sorted.length - 1].periodEnd as string;
      const totalAmount = sorted.reduce((sum, row) => sum + Number(row.amount), 0);

      let tenant = first.tenantOdooPartnerId
        ? await tenantsRepository.findByOdooPartnerId(first.tenantOdooPartnerId, ctx)
        : null;
      if (!tenant) {
        tenant = await tenantsRepository.create({
          full_name: first.tenantName,
          phone: first.tenantPhone,
          email: first.tenantEmail,
          national_id: null,
          odoo_partner_id: first.tenantOdooPartnerId,
          vat: first.tenantVat,
          street: first.tenantStreet,
          city: first.tenantCity,
          country_code: first.tenantCountryCode,
        }, ctx);
      }

      let contract = await contractsRepository.findByContractNumber(first.contractNumber, ctx);
      if (contract && contract.unit_id !== first.unitId) {
        for (const row of groupRows) errors.push({ odooInvoiceId: row.odooInvoiceId, message: 'Contract number already belongs to another unit' });
        continue;
      }

      if (!contract) {
        const active = await contractsRepository.findActiveByUnitId(first.unitId, ctx);
        if (active && active.contract_number !== first.contractNumber) {
          for (const row of groupRows) errors.push({ odooInvoiceId: row.odooInvoiceId, message: 'Unit already has a different active contract' });
          continue;
        }

        const today = new Date().toISOString().slice(0, 10);
        contract = await contractsRepository.create({
          unit_id: first.unitId,
          contract_number: first.contractNumber,
          tenant_id: tenant.id,
          start_date: startDate,
          end_date: endDate,
          total_amount: totalAmount,
          payment_cycle: first.paymentCycle,
          tax_mode: 'taxable',
          status: endDate < today ? 'completed' : 'active',
          notes: 'Imported from Odoo legacy invoices',
        }, ctx);
        contractCount++;
        if (endDate >= today) {
          await unitsRepository.update(first.unitId, { tenant_id: tenant.id }, ctx);
        }
      }

      for (const row of sorted) {
        try {
          const byOdoo = await invoicesRepository.findByOdooInvoiceId(row.odooInvoiceId, ctx);
          if (byOdoo) {
            skippedCount++;
            continue;
          }
          const byPeriod = await invoicesRepository.findByUnitAndPeriod(row.unitId as string, row.periodStart as string, row.periodEnd as string, ctx);
          if (byPeriod) {
            skippedCount++;
            continue;
          }
          const byNumber = await invoicesRepository.findByInvoiceNumber(row.odooInvoiceName, ctx);
          if (byNumber) {
            skippedCount++;
            continue;
          }

          await invoicesRepository.create({
            invoice_number: row.odooInvoiceName,
            contract_id: contract.id,
            unit_id: row.unitId as string,
            tenant_id: tenant.id,
            period_start: row.periodStart as string,
            period_end: row.periodEnd as string,
            amount: row.amount,
            paid_amount: row.paidAmount,
            status: row.status,
            due_date: row.dueDate ?? row.periodStart as string,
            issued_at: row.odooInvoiceState === 'posted' ? `${row.invoiceDate ?? row.periodStart}T00:00:00.000Z` : null,
            notes: 'Imported from Odoo legacy invoice',
            odoo_invoice_id: row.odooInvoiceId,
            odoo_invoice_name: row.odooInvoiceName,
            odoo_invoice_state: row.odooInvoiceState,
            odoo_sync_status: 'synced',
            odoo_sync_error: null,
          }, ctx);
          invoiceCount++;
        } catch (error) {
          errors.push({ odooInvoiceId: row.odooInvoiceId, message: messageFromError(error) });
        }
      }
    }

    await logOdoo(auth, 'import_legacy_invoices', 'invoice', null, errors.length > 0 ? 'needs_review' : 'synced', null, {
      invoiceCount,
      contractCount,
      skippedCount,
      errorCount: errors.length,
    }, ctx);

    return { success: true, invoiceCount, contractCount, skippedCount, errors };
  },

  async linkUnitProduct(auth: AuthContext, unitId: string, productId: number, ctx: LogContext) {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const existing = await unitsRepository.findByOdooProductId(productId, ctx);
    if (existing && existing.id !== unitId) return { success: false, error: 'productAlreadyLinked' };
    const product = await findRentalProduct(client, settings, productId);
    if (!product) return { success: false, error: 'productNotFound' };
    const unit = await unitsRepository.update(unitId, {
      unit_number: getOdooProductName(product),
      ...getUnitOdooMetadata(product),
    }, ctx);
    await logOdoo(auth, 'link_product', 'unit', unitId, 'synced', null, { product }, ctx);
    return { success: true, data: unit };
  },

  async createUnitFromProduct(auth: AuthContext, input: {
    locationId: string;
    productId: number;
  }, ctx: LogContext) {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const existing = await unitsRepository.findByOdooProductId(input.productId, ctx);
    if (existing) return { success: false, error: 'productAlreadyLinked' };

    const product = await findRentalProduct(client, settings, input.productId);
    if (!product) return { success: false, error: 'productNotFound' };

    let unit: Unit;
    try {
      unit = await unitsRepository.create({
        location_id: input.locationId,
        unit_number: getOdooProductName(product),
        status: 'vacant',
        ...getUnitOdooMetadata(product),
      }, ctx);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const constraint = readUniqueViolationConstraint(error);
      return {
        success: false,
        error: constraint === 'idx_units_odoo_product_unique'
          ? 'productAlreadyLinked'
          : 'duplicateUnit',
      };
    }
    await logOdoo(auth, 'create_unit_from_product', 'unit', unit.id, 'synced', null, { product }, ctx);
    return { success: true, data: unit };
  },

  async createProductForUnit(auth: AuthContext, unitId: string, ctx: LogContext) {
    const settings = await getOdooSettings(ctx);
    const client = new OdooClient(settings);
    const unit = await unitsRepository.findById(unitId, ctx);
    if (!unit) return { success: false, error: 'unitNotFound' };

    try {
      const fields = await client.fieldsGet('product.template');
      const stableReference = `RENTTAL-${unit.id.slice(0, 8).toUpperCase()}`;
      const existing = await client.searchRead('product.product', [
        ['default_code', '=', stableReference],
      ], ['id', 'name', 'default_code'], 1);
      if (existing[0]) return this.linkUnitProduct(auth, unitId, existing[0].id, ctx);
      const values: Record<string, XmlRpcValue> = {
        name: unit.location?.name_en ? `${unit.location.name_en} - ${unit.unit_number}` : unit.unit_number,
        default_code: stableReference,
        sale_ok: true,
      };
      if (fields.detailed_type) values.detailed_type = 'service';
      else if (fields.type) values.type = 'service';
      if (settings.productCategoryId) values.categ_id = settings.productCategoryId;
      if (fields.rent_ok) values.rent_ok = true;
      if (fields.recurring_invoice) values.recurring_invoice = true;
      const templateId = await client.create('product.template', values);
      const productId = await getProductVariantId(client, templateId);
      return this.linkUnitProduct(auth, unitId, productId, ctx);
    } catch (error) {
      const message = messageFromError(error);
      await unitsRepository.update(unitId, { odoo_sync_status: 'failed' }, ctx);
      await logOdoo(auth, 'create_product', 'unit', unitId, 'failed', message, {}, ctx);
      return { success: false, error: message };
    }
  },

  async syncInvoice(auth: AuthContext, invoiceId: string, ctx: LogContext) {
    const settings = await getOdooSettings(ctx);
    if (!settings.enabled) return { success: true, skipped: true };
    const invoice = await invoicesRepository.findById(invoiceId, ctx);
    if (!invoice?.contract_id) {
      return { success: false, error: 'invoiceNotReady' };
    }
    const contract = await contractsRepository.findById(invoice.contract_id, ctx);
    if (!contract || !contract.unit || !contract.tenant) return { success: false, error: 'contractNotReady' };
    const unit = contract.unit;
    const tenant = contract.tenant;

    if (!unit.odoo_product_id) {
      const message = 'Unit is not linked to an Odoo product';
      await invoicesRepository.update(invoice.id, { odoo_sync_status: 'failed', odoo_sync_error: message }, ctx);
      await logOdoo(auth, 'sync_invoice', 'invoice', invoice.id, 'failed', message, {}, ctx);
      return { success: false, error: message };
    }

    const client = new OdooClient(settings);
    try {
      const partnerId = await findOrCreatePartner(client, tenant);
      if (tenant.odoo_partner_id !== partnerId) {
        await tenantsRepository.update(tenant.id, { odoo_partner_id: partnerId }, ctx);
      }
      const result = await upsertOdooInvoice({ client, settings, contract, invoice, partnerId, unit });
      const status = result.needsReview ? 'needs_review' : 'synced';
      await invoicesRepository.update(invoice.id, {
        odoo_invoice_id: result.id,
        odoo_invoice_name: result.name ?? null,
        odoo_invoice_state: result.state ?? null,
        odoo_sync_status: status,
        odoo_sync_error: result.needsReview ? 'Odoo invoice is no longer draft' : null,
      }, ctx);
      await logOdoo(auth, invoice.odoo_invoice_id ? 'update_invoice' : 'create_invoice', 'invoice', invoice.id, status, null, {
        odoo_invoice_id: result.id,
        url: getOdooUrl(settings, 'account.move', result.id),
      }, ctx);
      return { success: !result.needsReview, needsReview: Boolean(result.needsReview) };
    } catch (error) {
      const message = messageFromError(error);
      await invoicesRepository.update(invoice.id, { odoo_sync_status: 'failed', odoo_sync_error: message }, ctx);
      await logOdoo(auth, 'sync_invoice', 'invoice', invoice.id, 'failed', message, {}, ctx);
      return { success: false, error: message };
    }
  },

  async syncLinkedInvoices(auth: AuthContext, ctx: LogContext, limit = 250) {
    const settings = await getOdooSettings(ctx);
    if (!settings.enabled) return { checked: 0, updated: 0, errors: [] as string[] };
    const localInvoices = await invoicesRepository.findLinkedForOdooSync(ctx, limit);
    const ids = localInvoices
      .map((invoice) => invoice.odoo_invoice_id)
      .filter((id): id is number => id != null);
    if (ids.length === 0) return { checked: 0, updated: 0, errors: [] as string[] };

    const client = new OdooClient(settings);
    const records = await client.read('account.move', ids, [
      'id',
      'name',
      'state',
      'payment_state',
      'amount_total',
      'amount_residual',
    ]);
    const recordById = new Map(records.map((record) => [Number(record.id), record]));
    let updated = 0;
    const errors: string[] = [];

    for (const invoice of localInvoices) {
      if (!invoice.odoo_invoice_id) continue;
      const record = recordById.get(invoice.odoo_invoice_id);
      if (!record) {
        errors.push(`Odoo invoice ${invoice.odoo_invoice_id} was not found`);
        continue;
      }
      try {
        await invoicesRepository.syncFromOdoo({
          odooInvoiceId: invoice.odoo_invoice_id,
          invoiceName: typeof record.name === 'string' ? record.name : null,
          moveState: typeof record.state === 'string' ? record.state : 'draft',
          paymentState: typeof record.payment_state === 'string' ? record.payment_state : null,
          amountTotal: Number(record.amount_total ?? 0),
          amountResidual: Number(record.amount_residual ?? 0),
        }, ctx);
        updated++;
      } catch (error) {
        errors.push(messageFromError(error));
      }
    }

    return { checked: localInvoices.length, updated, errors };
  },

  async retryInvoice(auth: AuthContext, invoiceId: string, ctx: LogContext) {
    return this.syncInvoice(auth, invoiceId, ctx);
  },
};
