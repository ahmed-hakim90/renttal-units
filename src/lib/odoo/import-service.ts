import 'server-only';

import { addMonths, differenceInCalendarDays, format, subDays } from 'date-fns';
import { OdooClient, type OdooRecord } from '@/lib/odoo/client';
import { buildOdooCategoryDomain } from '@/lib/odoo/category-domain';
import { getOdooSettings, getRentalProductCategoryIds } from '@/lib/odoo/settings';
import { odooImportRepository } from '@/lib/repositories/odoo-import';
import { invoicesRepository } from '@/lib/repositories/invoices';
import { unitsRepository } from '@/lib/repositories/units';
import type { LogContext } from '@/lib/observability';
import type {
  AuthContext,
  OdooImportItem,
  OdooImportItemStatus,
  PaymentCycle,
  Unit,
} from '@/types/database';

type AnalyticDistribution = Record<string, number>;

export type OdooImportLinePayload = {
  odooLineId: number;
  productOdooId: number | null;
  productName: string | null;
  unitId: string | null;
  unitNumber: string | null;
  localInvoiceId: string | null;
  description: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  analyticDistribution: AnalyticDistribution | null;
  taxIds: number[];
  isRental: boolean;
  mappingStatus: 'matched' | 'unmatched' | 'needs_review' | 'service';
  reviewReason: string | null;
  suggestedContractNumber: string | null;
};

export type OdooImportPaymentPayload = {
  odooPartialReconcileId: number;
  odooPaymentId: number | null;
  paymentDate: string | null;
  amount: number;
  currencyCode: string | null;
  reference: string | null;
  rawPayload: Record<string, unknown>;
};

export type OdooImportDocumentPayload = {
  odooInvoiceId: number;
  companyOdooId: number | null;
  partnerOdooId: number | null;
  tenantId: string | null;
  partner: {
    name: string;
    phone: string | null;
    email: string | null;
    vat: string | null;
    street: string | null;
    city: string | null;
    countryCode: string | null;
  };
  invoiceName: string;
  reference: string | null;
  moveType: string;
  moveState: string;
  paymentState: string | null;
  currencyCode: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  amountResidual: number;
  amountPaid: number;
  writeDate: string | null;
  lines: OdooImportLinePayload[];
  payments: OdooImportPaymentPayload[];
  rawPayload: Record<string, unknown>;
};

export type OdooInvoiceImportPreview = {
  runId: string;
  status: string;
  summary: {
    documentCount: number;
    readyCount: number;
    reviewCount: number;
    lineCount: number;
    matchedLineCount: number;
    unmatchedLineCount: number;
    multiUnitCount: number;
    amountTotal: number;
  };
  documents: Array<{
    itemId: string;
    itemStatus: OdooImportItemStatus;
    errors: string[];
    mapping: Record<string, unknown>;
    document: OdooImportDocumentPayload;
  }>;
};

function many2OneId(value: unknown) {
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  return typeof value === 'number' ? value : null;
}

function many2OneName(value: unknown) {
  if (Array.isArray(value) && typeof value[1] === 'string') return value[1];
  return typeof value === 'string' ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function dateValue(value: unknown) {
  const valueString = stringValue(value);
  return valueString && /^\d{4}-\d{2}-\d{2}/.test(valueString)
    ? valueString.slice(0, 10)
    : null;
}

function dateTimeValue(value: unknown) {
  const valueString = stringValue(value);
  if (!valueString) return null;
  const normalized = valueString.includes('T') ? valueString : valueString.replace(' ', 'T');
  return normalized.endsWith('Z') ? normalized : `${normalized}Z`;
}

function analyticValue(value: unknown): AnalyticDistribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const distribution: AnalyticDistribution = {};
  for (const [key, raw] of Object.entries(value)) {
    const amount = Number(raw);
    if (Number.isFinite(amount)) distribution[key] = amount;
  }
  return Object.keys(distribution).length > 0 ? distribution : null;
}

function idArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((id): id is number => typeof id === 'number')
    : [];
}

function chunks<T>(values: T[], size = 150) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function readInChunks(client: OdooClient, model: string, ids: number[], fields: string[]) {
  const rows: OdooRecord[] = [];
  for (const idChunk of chunks(ids)) {
    rows.push(...await client.read(model, idChunk, fields));
  }
  return rows;
}

function looksLikeService(description: string, productName: string | null) {
  const text = `${description} ${productName ?? ''}`.toLowerCase();
  return /(service|fee|management|utility|خدمات|رسوم|إدارة)/i.test(text);
}

function trustedContractReference(reference: string | null) {
  if (!reference) return null;
  const value = reference.trim();
  return /^(?:CTR|CONT|CONTRACT|LEASE|عقد)[\s:/#_-]*[A-Z0-9\u0600-\u06FF][A-Z0-9\u0600-\u06FF/_-]*$/i.test(value)
    ? value
    : null;
}

function suggestedContractNumber(input: {
  trustedReference: string | null;
  partnerId: number | null;
  unit: Unit | null;
  periodStart: string | null;
}) {
  if (input.trustedReference) return input.trustedReference;
  if (!input.partnerId || !input.unit || !input.periodStart) return null;
  return `ODOO-${input.partnerId}-${input.unit.unit_number}-${input.periodStart.slice(0, 7).replace('-', '')}`;
}

function inferPaymentCycle(periods: Array<{ start: string; end: string }>): PaymentCycle | null {
  if (periods.length === 0) return null;
  const candidates: Array<{ months: number; cycle: PaymentCycle }> = [
    { months: 1, cycle: 'monthly' },
    { months: 3, cycle: 'quarterly' },
    { months: 6, cycle: 'semi_annual' },
    { months: 12, cycle: 'yearly' },
  ];
  const detected = periods.map(({ start, end }) => {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    return candidates.find(({ months }) => {
      const expectedInclusiveEnd = subDays(addMonths(startDate, months), 1);
      const expectedSameDayEnd = addMonths(startDate, months);
      return Math.min(
        Math.abs(differenceInCalendarDays(endDate, expectedInclusiveEnd)),
        Math.abs(differenceInCalendarDays(endDate, expectedSameDayEnd)),
      ) <= 2;
    })?.cycle ?? null;
  });
  return detected[0] && detected.every((cycle) => cycle === detected[0]) ? detected[0] : null;
}

async function loadCategoryProducts(client: OdooClient, categoryIds: number[]) {
  return client.searchReadAll('product.product', buildOdooCategoryDomain(categoryIds), [
    'id',
    'name',
    'display_name',
    'default_code',
    'categ_id',
  ], { pageSize: 100, maxRecords: 10_000 });
}

async function loadMoves(client: OdooClient, productIds: number[], since?: string | null) {
  const domain: import('@/lib/odoo/xml-rpc').XmlRpcValue[] = [
    ['product_id', 'in', productIds],
    ['move_id.move_type', '=', 'out_invoice'],
    ['move_id.state', 'in', ['draft', 'posted']],
  ];
  if (since) domain.push(['move_id.write_date', '>', since]);

  const rentalLines = await client.searchReadAll('account.move.line', domain, ['id', 'move_id'], {
    pageSize: 250,
    maxRecords: 20_000,
  });
  const moveIds = Array.from(new Set(rentalLines
    .map((line) => many2OneId(line.move_id))
    .filter((id): id is number => id != null)));
  if (moveIds.length === 0) return [];

  return readInChunks(client, 'account.move', moveIds, [
    'id',
    'name',
    'ref',
    'move_type',
    'state',
    'payment_state',
    'partner_id',
    'company_id',
    'currency_id',
    'invoice_date',
    'invoice_date_due',
    'amount_untaxed',
    'amount_tax',
    'amount_total',
    'amount_residual',
    'invoice_line_ids',
    'line_ids',
    'write_date',
  ]);
}

async function loadPartners(client: OdooClient, moves: OdooRecord[]) {
  const partnerIds = Array.from(new Set(moves
    .map((move) => many2OneId(move.partner_id))
    .filter((id): id is number => id != null)));
  const partners = partnerIds.length > 0
    ? await readInChunks(client, 'res.partner', partnerIds, [
        'id',
        'name',
        'phone',
        'email',
        'vat',
        'street',
        'city',
        'country_id',
        'active',
        'customer_rank',
      ])
    : [];
  const countryIds = Array.from(new Set(partners
    .map((partner) => many2OneId(partner.country_id))
    .filter((id): id is number => id != null)));
  const countries = countryIds.length > 0
    ? await readInChunks(client, 'res.country', countryIds, ['id', 'code'])
    : [];
  const countryCodes = new Map(countries.map((country) => [country.id, stringValue(country.code)]));
  return new Map(partners.map((partner) => [
    partner.id,
    {
      record: partner,
      countryCode: many2OneId(partner.country_id)
        ? countryCodes.get(many2OneId(partner.country_id) as number) ?? null
        : null,
    },
  ]));
}

async function loadPaymentAllocations(
  client: OdooClient,
  moves: OdooRecord[],
  currencyByMove: Map<number, string | null>,
) {
  const accountingLineIds = moves.flatMap((move) => idArray(move.line_ids));
  if (accountingLineIds.length === 0) return new Map<number, OdooImportPaymentPayload[]>();

  const accountingFields = await client.fieldsGet('account.move.line');
  if (!accountingFields.matched_credit_ids) return new Map<number, OdooImportPaymentPayload[]>();
  const accountingLines = await readInChunks(client, 'account.move.line', accountingLineIds, [
    'id',
    'move_id',
    'matched_credit_ids',
  ]);
  const invoiceMoveByDebitLine = new Map<number, number>();
  const partialIds: number[] = [];
  for (const line of accountingLines) {
    const moveId = many2OneId(line.move_id);
    if (!moveId) continue;
    const matches = idArray(line.matched_credit_ids);
    if (matches.length === 0) continue;
    invoiceMoveByDebitLine.set(line.id, moveId);
    partialIds.push(...matches);
  }
  if (partialIds.length === 0) return new Map<number, OdooImportPaymentPayload[]>();

  const partials = await readInChunks(client, 'account.partial.reconcile', Array.from(new Set(partialIds)), [
    'id',
    'amount',
    'debit_move_id',
    'credit_move_id',
    'create_date',
  ]);
  const creditLineIds = Array.from(new Set(partials
    .map((partial) => many2OneId(partial.credit_move_id))
    .filter((id): id is number => id != null)));
  const creditFields = await client.fieldsGet('account.move.line');
  const creditLines = creditLineIds.length > 0
    ? await readInChunks(client, 'account.move.line', creditLineIds, [
        'id',
        'move_id',
        'date',
        'name',
        ...(creditFields.payment_id ? ['payment_id'] : []),
      ])
    : [];
  const creditById = new Map(creditLines.map((line) => [line.id, line]));

  const result = new Map<number, OdooImportPaymentPayload[]>();
  for (const partial of partials) {
    const debitLineId = many2OneId(partial.debit_move_id);
    const invoiceMoveId = debitLineId ? invoiceMoveByDebitLine.get(debitLineId) : null;
    if (!invoiceMoveId) continue;
    const creditLineId = many2OneId(partial.credit_move_id);
    const creditLine = creditLineId ? creditById.get(creditLineId) : null;
    const allocation: OdooImportPaymentPayload = {
      odooPartialReconcileId: partial.id,
      odooPaymentId: many2OneId(creditLine?.payment_id),
      paymentDate: dateValue(creditLine?.date) ?? dateValue(partial.create_date),
      amount: numberValue(partial.amount),
      currencyCode: currencyByMove.get(invoiceMoveId) ?? null,
      reference: stringValue(creditLine?.name) ?? many2OneName(creditLine?.move_id),
      rawPayload: {
        partialReconcileId: partial.id,
        creditMoveLineId: creditLineId,
      },
    };
    result.set(invoiceMoveId, [...(result.get(invoiceMoveId) ?? []), allocation]);
  }
  return result;
}

async function buildImportPayloads(ctx: LogContext, since?: string | null) {
  const settings = await getOdooSettings(ctx);
  const rentalCategoryIds = getRentalProductCategoryIds(settings);
  if (rentalCategoryIds.length === 0) throw new Error('At least one Odoo Product Category is required before importing invoices');
  const client = new OdooClient(settings);
  const [products, units, localInvoices, existingDocuments] = await Promise.all([
    loadCategoryProducts(client, rentalCategoryIds),
    unitsRepository.findAll(ctx),
    invoicesRepository.findAll(ctx),
    odooImportRepository.findDocuments({}, ctx),
  ]);
  const productIds = products.map((product) => product.id);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const unitsByProduct = new Map(units
    .filter((unit) => unit.odoo_product_id != null)
    .map((unit) => [unit.odoo_product_id as number, unit]));
  const localInvoicesByOdooId = new Map(localInvoices
    .filter((invoice) => invoice.odoo_invoice_id != null)
    .map((invoice) => [invoice.odoo_invoice_id as number, invoice]));
  const existingIds = new Set(existingDocuments.map((document) => document.odoo_invoice_id));
  const moves = await loadMoves(client, productIds, since);
  const lineIds = Array.from(new Set(moves.flatMap((move) => idArray(move.invoice_line_ids))));
  const lineFields = await client.fieldsGet('account.move.line');
  const lines = lineIds.length > 0
    ? await readInChunks(client, 'account.move.line', lineIds, [
        'id',
        'move_id',
        'product_id',
        'name',
        'price_subtotal',
        'price_total',
        ...(lineFields.tax_ids ? ['tax_ids'] : []),
        ...(lineFields.analytic_distribution ? ['analytic_distribution'] : []),
        ...(lineFields[settings.startDateField] ? [settings.startDateField] : []),
        ...(lineFields[settings.endDateField] ? [settings.endDateField] : []),
      ])
    : [];
  const linesByMove = new Map<number, OdooRecord[]>();
  for (const line of lines) {
    const moveId = many2OneId(line.move_id);
    if (!moveId) continue;
    linesByMove.set(moveId, [...(linesByMove.get(moveId) ?? []), line]);
  }
  const partners = await loadPartners(client, moves);
  const currencyByMove = new Map(moves.map((move) => [move.id, many2OneName(move.currency_id)]));
  const paymentsByMove = await loadPaymentAllocations(client, moves, currencyByMove);

  return moves
    .sort((a, b) => b.id - a.id)
    .map((move) => {
      const partnerId = many2OneId(move.partner_id);
      const partner = partnerId ? partners.get(partnerId) : null;
      const reference = stringValue(move.ref);
      const trustedReference = trustedContractReference(reference);
      const moveLines = linesByMove.get(move.id) ?? [];
      const localInvoice = localInvoicesByOdooId.get(move.id) ?? null;
      const payloadLines: OdooImportLinePayload[] = moveLines.map((line) => {
        const productId = many2OneId(line.product_id);
        const product = productId ? productsById.get(productId) : null;
        const unit = productId ? unitsByProduct.get(productId) ?? null : null;
        const description = stringValue(line.name) ?? '';
        const productName = product ? stringValue(product.display_name) ?? stringValue(product.name) : many2OneName(line.product_id);
        const periodStart = dateValue(line[settings.startDateField]);
        const periodEnd = dateValue(line[settings.endDateField]);
        const inRentalCategory = Boolean(productId && productsById.has(productId));
        const isService = !inRentalCategory || (!unit && looksLikeService(description, productName));
        const mappingStatus = isService
          ? 'service'
          : unit
            ? periodStart && periodEnd ? 'matched' : 'needs_review'
            : 'needs_review';
        const reviewReason = isService
          ? null
          : !unit
            ? 'unitProductNotLinked'
            : !periodStart || !periodEnd
              ? 'periodMissing'
              : trustedReference
                ? null
                : 'contractNumberSuggested';
        const amountUntaxed = numberValue(line.price_subtotal);
        const amountTotal = numberValue(line.price_total);
        const matchesLocalInvoice = Boolean(
          localInvoice
          && unit?.id === localInvoice.unit_id
          && (
            !periodStart
            || !periodEnd
            || (
              periodStart === localInvoice.period_start
              && periodEnd === localInvoice.period_end
            )
          )
        );
        return {
          odooLineId: line.id,
          productOdooId: productId,
          productName,
          unitId: unit?.id ?? null,
          unitNumber: unit?.unit_number ?? null,
          localInvoiceId: matchesLocalInvoice ? localInvoice?.id ?? null : null,
          description: description || null,
          periodStart,
          periodEnd,
          amountUntaxed,
          amountTax: Math.max(0, amountTotal - amountUntaxed),
          amountTotal,
          analyticDistribution: analyticValue(line.analytic_distribution),
          taxIds: idArray(line.tax_ids),
          isRental: !isService,
          mappingStatus,
          reviewReason,
          suggestedContractNumber: suggestedContractNumber({
            trustedReference,
            partnerId,
            unit: isService ? null : unit,
            periodStart: isService ? null : periodStart,
          }) ?? (isService && trustedReference ? trustedReference : null),
        };
      });
      const amountTotal = numberValue(move.amount_total);
      const amountResidual = numberValue(move.amount_residual);
      const partnerRecord = partner?.record;
      const payload: OdooImportDocumentPayload = {
        odooInvoiceId: move.id,
        companyOdooId: many2OneId(move.company_id),
        partnerOdooId: partnerId,
        tenantId: null,
        partner: {
          name: stringValue(partnerRecord?.name) ?? many2OneName(move.partner_id) ?? 'Unknown Odoo customer',
          phone: stringValue(partnerRecord?.phone),
          email: stringValue(partnerRecord?.email),
          vat: stringValue(partnerRecord?.vat),
          street: stringValue(partnerRecord?.street),
          city: stringValue(partnerRecord?.city),
          countryCode: partner?.countryCode ?? null,
        },
        invoiceName: stringValue(move.name) ?? String(move.id),
        reference,
        moveType: stringValue(move.move_type) ?? 'out_invoice',
        moveState: stringValue(move.state) ?? 'draft',
        paymentState: stringValue(move.payment_state),
        currencyCode: many2OneName(move.currency_id),
        invoiceDate: dateValue(move.invoice_date),
        dueDate: dateValue(move.invoice_date_due),
        amountUntaxed: numberValue(move.amount_untaxed),
        amountTax: numberValue(move.amount_tax),
        amountTotal,
        amountResidual,
        amountPaid: Math.max(0, amountTotal - amountResidual),
        writeDate: dateTimeValue(move.write_date),
        lines: payloadLines,
        payments: paymentsByMove.get(move.id) ?? [],
        rawPayload: {
          odooInvoiceId: move.id,
          invoiceLineIds: idArray(move.invoice_line_ids),
          existingDocument: existingIds.has(move.id),
          partner: {
            name: stringValue(partnerRecord?.name) ?? many2OneName(move.partner_id) ?? 'Unknown Odoo customer',
            phone: stringValue(partnerRecord?.phone),
            email: stringValue(partnerRecord?.email),
            vat: stringValue(partnerRecord?.vat),
            street: stringValue(partnerRecord?.street),
            city: stringValue(partnerRecord?.city),
            countryCode: partner?.countryCode ?? null,
          },
        },
      };
      const errors: string[] = [];
      if (!partnerId) errors.push('partnerMissing');
      if (payloadLines.length === 0) errors.push('invoiceLinesMissing');
      if (payloadLines.some((line) => line.reviewReason)) {
        errors.push(...new Set(payloadLines.map((line) => line.reviewReason).filter((value): value is string => Boolean(value))));
      }
      if (existingIds.has(move.id)) errors.push('existingDocumentWillUpdate');
      const status: OdooImportItemStatus = errors.some((error) => error !== 'existingDocumentWillUpdate')
        ? 'needs_review'
        : 'ready';
      return { payload, errors, status };
    });
}

function previewFromItems(runId: string, runStatus: string, items: OdooImportItem[]): OdooInvoiceImportPreview {
  const documents = items
    .filter((item) => item.item_type === 'invoice_document')
    .map((item) => ({
      itemId: item.id,
      itemStatus: item.status,
      errors: Array.isArray(item.errors) ? item.errors.map(String) : [],
      mapping: item.mapping,
      document: item.payload as unknown as OdooImportDocumentPayload,
    }));
  const allLines = documents.flatMap((item) => item.document.lines);
  return {
    runId,
    status: runStatus,
    summary: {
      documentCount: documents.length,
      readyCount: documents.filter((item) => item.itemStatus === 'ready').length,
      reviewCount: documents.filter((item) => item.itemStatus === 'needs_review').length,
      lineCount: allLines.length,
      matchedLineCount: allLines.filter((line) => line.mappingStatus === 'matched').length,
      unmatchedLineCount: allLines.filter((line) => line.mappingStatus === 'needs_review' || line.mappingStatus === 'unmatched').length,
      multiUnitCount: documents.filter((item) => new Set(item.document.lines.map((line) => line.unitId).filter(Boolean)).size > 1).length,
      amountTotal: documents.reduce((sum, item) => sum + item.document.amountTotal, 0),
    },
    documents,
  };
}

export const odooImportService = {
  async startIncrementalPreview(auth: AuthContext, ctx: LogContext) {
    const since = await odooImportRepository.findLatestDocumentWriteDate(ctx);
    return this.startInvoicePreview(auth, ctx, {
      since,
      importType: since ? 'incremental_sync' : 'invoices',
    });
  },

  async startInvoicePreview(
    auth: AuthContext,
    ctx: LogContext,
    input?: { since?: string | null; importType?: 'invoices' | 'incremental_sync' },
  ) {
    const run = await odooImportRepository.createRun({
      import_type: input?.importType ?? 'invoices',
      requested_by: ctx.system === true ? null : auth.userId,
      cursor: input?.since ? { since: input.since } : {},
    }, ctx);
    try {
      const payloads = await buildImportPayloads(ctx, input?.since);
      const items = await odooImportRepository.upsertItems(payloads.map(({ payload, errors, status }) => ({
        run_id: run.id,
        item_type: 'invoice_document',
        odoo_model: 'account.move',
        odoo_record_id: payload.odooInvoiceId,
        status,
        payload: payload as unknown as Record<string, unknown>,
        mapping: {},
        errors,
      })), ctx);
      const preview = previewFromItems(run.id, 'ready', items);
      await odooImportRepository.updateRun(run.id, {
        status: 'ready',
        summary: preview.summary,
      }, ctx);
      return preview;
    } catch (error) {
      await odooImportRepository.updateRun(run.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      }, ctx);
      throw error;
    }
  },

  async getInvoicePreview(runId: string, auth: AuthContext, ctx: LogContext) {
    const [run, items] = await Promise.all([
      odooImportRepository.findRun(runId, ctx),
      odooImportRepository.findItems(runId, ctx),
    ]);
    if (!run || (ctx.system !== true && run.requested_by !== auth.userId)) {
      throw new Error('Odoo import run was not found');
    }
    return previewFromItems(run.id, run.status, items);
  },

  async updateInvoiceMapping(
    runId: string,
    itemId: string,
    mapping: Record<string, unknown>,
    auth: AuthContext,
    ctx: LogContext,
  ) {
    const run = await odooImportRepository.findRun(runId, ctx);
    if (!run || (ctx.system !== true && run.requested_by !== auth.userId)) {
      throw new Error('Odoo import run was not found');
    }
    const item = (await odooImportRepository.findItemsByIds(runId, [itemId], ctx))[0];
    if (!item) throw new Error('Odoo import item was not found');
    return odooImportRepository.updateItem(item.id, { mapping }, ctx);
  },

  async updateInvoiceMappings(
    runId: string,
    updates: Array<{ itemId: string; mapping: Record<string, unknown> }>,
    auth: AuthContext,
    ctx: LogContext,
  ) {
    const run = await odooImportRepository.findRun(runId, ctx);
    if (!run || (ctx.system !== true && run.requested_by !== auth.userId)) {
      throw new Error('Odoo import run was not found');
    }
    const allowedItems = await odooImportRepository.findItemsByIds(
      runId,
      updates.map((update) => update.itemId),
      ctx,
    );
    const allowedIds = new Set(allowedItems.map((item) => item.id));
    const results: OdooImportItem[] = [];
    for (const update of updates) {
      if (!allowedIds.has(update.itemId)) continue;
      results.push(await odooImportRepository.updateItem(update.itemId, {
        mapping: update.mapping,
      }, ctx));
    }
    return results;
  },

  async commitInvoiceImport(
    auth: AuthContext,
    runId: string,
    itemIds: string[],
    ctx: LogContext,
    options?: { createContracts?: boolean },
  ) {
    const run = await odooImportRepository.findRun(runId, ctx);
    if (!run || (ctx.system !== true && run.requested_by !== auth.userId)) {
      throw new Error('Odoo import run was not found');
    }
    const items = await odooImportRepository.findItemsByIds(runId, Array.from(new Set(itemIds)), ctx);
    await odooImportRepository.updateRun(runId, { status: 'committing', error: null }, ctx);

    const units = await unitsRepository.findAll(ctx);
    const unitsByProduct = new Map(units
      .filter((unit) => unit.odoo_product_id != null)
      .map((unit) => [unit.odoo_product_id as number, unit]));
    const imported: Array<{
      item: OdooImportItem;
      payload: OdooImportDocumentPayload;
      tenantId: string | null;
    }> = [];
    const errors: Array<{ itemId: string; invoiceName: string; message: string }> = [];

    for (const item of items) {
      const payload = item.payload as unknown as OdooImportDocumentPayload;
      try {
        const lineMappings = item.mapping.lineMappings && typeof item.mapping.lineMappings === 'object'
          ? item.mapping.lineMappings as Record<string, Record<string, unknown>>
          : {};
        const lines = payload.lines.map((line) => {
          const override = lineMappings[String(line.odooLineId)] ?? {};
          const currentUnit = line.productOdooId ? unitsByProduct.get(line.productOdooId) ?? null : null;
          const unitId = typeof override.unitId === 'string' ? override.unitId : currentUnit?.id ?? line.unitId;
          const targetUnit = unitId ? units.find((unit) => unit.id === unitId) ?? null : null;
          if (targetUnit && line.productOdooId && targetUnit.odoo_product_id !== line.productOdooId) {
            throw new Error(`Unit ${targetUnit.unit_number} is not linked to Odoo product ${line.productOdooId}`);
          }
          return {
            ...line,
            unitId: targetUnit?.id ?? null,
            unitNumber: targetUnit?.unit_number ?? null,
            periodStart: typeof override.periodStart === 'string' ? override.periodStart : line.periodStart,
            periodEnd: typeof override.periodEnd === 'string' ? override.periodEnd : line.periodEnd,
            suggestedContractNumber: typeof override.contractNumber === 'string'
              ? override.contractNumber.trim()
              : line.suggestedContractNumber,
            mappingStatus: line.mappingStatus === 'service'
              ? 'service'
              : targetUnit ? 'matched' : 'needs_review',
            reviewReason: line.mappingStatus === 'service'
              ? null
              : targetUnit ? null : 'unitProductNotLinked',
          } satisfies OdooImportLinePayload;
        });
        payload.lines = lines;
        const savedDocument = await odooImportRepository.upsertDocumentAtomic({
          document: {
            ...payload,
            lines: undefined,
            payments: undefined,
          },
          lines,
          payments: payload.payments,
          importItemId: item.id,
        }, ctx);
        payload.tenantId = savedDocument.tenant_id;
        imported.push({ item, payload, tenantId: savedDocument.tenant_id });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ itemId: item.id, invoiceName: payload.invoiceName, message });
        await odooImportRepository.updateItem(item.id, {
          status: 'failed',
          errors: [...new Set([...(item.errors ?? []), message])],
        }, ctx);
      }
    }

    const contractGroups = new Map<string, {
      contractNumber: string;
      primaryUnitId: string;
      tenantId: string;
      lineIds: number[];
      periods: Array<{ start: string; end: string }>;
      totalAmount: number;
      lines: Array<{
        lineType: 'rental' | 'service';
        unitId: string | null;
        description: string | null;
        amount: number;
        periodStart: string | null;
        periodEnd: string | null;
        odooLineId: number;
        sortOrder: number;
      }>;
    }>();
    for (const { payload, tenantId } of imported) {
      if (!tenantId) continue;
      const documentContractNumber = payload.lines
        .map((line) => line.suggestedContractNumber)
        .find((value): value is string => Boolean(value));
      let sortOrder = 0;
      for (const line of payload.lines) {
        const contractNumber = line.suggestedContractNumber
          ?? (line.mappingStatus === 'service' ? documentContractNumber : null);
        if (!contractNumber) continue;
        if (line.isRental && (!line.unitId || !line.periodStart || !line.periodEnd)) continue;
        if (!line.isRental && line.mappingStatus !== 'service') continue;

        const key = `${contractNumber}:${tenantId}`;
        const group = contractGroups.get(key) ?? {
          contractNumber,
          primaryUnitId: '',
          tenantId,
          lineIds: [],
          periods: [],
          totalAmount: 0,
          lines: [],
        };
        if (line.isRental && line.unitId && !group.primaryUnitId) {
          group.primaryUnitId = line.unitId;
        }
        group.lineIds.push(line.odooLineId);
        if (line.periodStart && line.periodEnd) {
          group.periods.push({ start: line.periodStart, end: line.periodEnd });
        }
        group.totalAmount += line.amountUntaxed;
        group.lines.push({
          lineType: line.isRental ? 'rental' : 'service',
          unitId: line.isRental ? line.unitId : null,
          description: line.description ?? line.productName,
          amount: line.amountUntaxed,
          periodStart: line.periodStart,
          periodEnd: line.periodEnd,
          odooLineId: line.odooLineId,
          sortOrder: sortOrder++,
        });
        contractGroups.set(key, group);
      }
    }

    let contractCount = 0;
    for (const group of options?.createContracts === false ? [] : contractGroups.values()) {
      if (!group.primaryUnitId || group.lines.every((line) => line.lineType !== 'rental')) continue;
      const cycle = inferPaymentCycle(group.periods);
      if (!cycle) continue;
      const sorted = [...group.periods].sort((a, b) => a.start.localeCompare(b.start));
      const startDate = sorted[0]?.start ?? format(new Date(), 'yyyy-MM-dd');
      const endDate = [...sorted].sort((a, b) => b.end.localeCompare(a.end))[0]?.end ?? startDate;
      try {
        await odooImportRepository.mapContractGroupAtomic({
          contractNumber: group.contractNumber,
          unitId: group.primaryUnitId,
          tenantId: group.tenantId,
          startDate,
          endDate,
          totalAmount: group.totalAmount,
          paymentCycle: cycle,
          taxMode: 'taxable',
          status: endDate < format(new Date(), 'yyyy-MM-dd') ? 'completed' : 'active',
          notes: 'Imported from normalized Odoo invoice documents',
        }, group.lineIds, ctx, group.lines.map((line) => ({
          lineType: line.lineType,
          unitId: line.unitId,
          description: line.description,
          amount: line.amount,
          periodStart: line.periodStart ?? startDate,
          periodEnd: line.periodEnd ?? endDate,
          odooLineId: line.odooLineId,
          sortOrder: line.sortOrder,
        })));
        contractCount++;
      } catch (error) {
        errors.push({
          itemId: '',
          invoiceName: group.contractNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = {
      requestedCount: items.length,
      importedCount: imported.length,
      contractCount,
      errorCount: errors.length,
    };
    await odooImportRepository.updateRun(runId, {
      status: errors.length === items.length && items.length > 0 ? 'failed' : 'completed',
      summary,
      error: errors.length > 0 ? `${errors.length} item(s) need review` : null,
      completed_at: new Date().toISOString(),
    }, ctx);
    return { ...summary, errors };
  },
};
