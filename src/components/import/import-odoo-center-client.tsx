'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  FileSearch,
  Link2,
  RefreshCw,
} from 'lucide-react';
import { Button, buttonStyles } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DocumentListSkeleton,
  LoadingRegion,
  StatsCardsSkeleton,
} from '@/components/ui/skeleton';
import {
  commitOdooInvoiceImport,
  getOdooInvoiceImportPreview,
  startOdooInvoiceImportPreview,
  testOdooConnection,
  updateOdooInvoiceImportMappings,
} from '@/lib/actions/odoo';
import { isFeatureDisabledResult } from '@/lib/features';
import { formatCurrency } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { Unit } from '@/types/database';

type ContractOption = {
  id: string;
  contractNumber: string;
  tenantName: string | null;
  unitId: string;
  unitNumber: string;
  startDate: string | null;
  endDate: string | null;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    periodStart: string;
    periodEnd: string;
    amountTotal: number;
    status: string;
  }>;
};

type ImportLine = {
  odooLineId: number;
  productOdooId: number | null;
  productName: string | null;
  unitId: string | null;
  unitNumber: string | null;
  contractId: string | null;
  contractNumber: string | null;
  localInvoiceId: string | null;
  localInvoiceNumber: string | null;
  description: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  isRental: boolean;
  mappingStatus: 'matched' | 'unmatched' | 'needs_review' | 'service';
  reviewReason: string | null;
  matchReason: string | null;
  suggestedContractNumber: string | null;
  contractOptions: ContractOption[];
};

type ImportDocument = {
  odooInvoiceId: number;
  partnerOdooId: number | null;
  partner: { name: string };
  invoiceName: string;
  reference: string | null;
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
  lines: ImportLine[];
};

type ImportPreview = {
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
    itemStatus: 'ready' | 'needs_review' | 'duplicate' | 'imported' | 'failed' | 'ignored';
    errors: string[];
    mapping: Record<string, unknown>;
    document: ImportDocument;
  }>;
  localInvoices: Array<{
    id: string;
    invoiceNumber: string;
    contractId: string;
    contractNumber: string;
    unitId: string;
    unitNumber: string;
    tenantName: string | null;
    periodStart: string;
    periodEnd: string;
    amountTotal: number;
    status: string;
    odooInvoiceId: number | null;
    odooInvoiceName: string | null;
    odooInvoiceState: string | null;
    odooPaymentState: string | null;
  }>;
};

type LineMapping = {
  unitId?: string;
  contractId?: string;
  contractNumber?: string;
  localInvoiceId?: string;
  periodStart?: string;
  periodEnd?: string;
};

const PAGE_SIZE = 20;
const PREVIEW_SESSION_KEY_PREFIX = 'rentara:odoo-import-preview:';

function previewSessionKey(locale: string) {
  return `${PREVIEW_SESSION_KEY_PREFIX}${locale}`;
}

function initialMappings(preview: ImportPreview) {
  const mappings: Record<string, Record<string, LineMapping>> = {};
  for (const item of preview.documents) {
    const saved = item.mapping.lineMappings && typeof item.mapping.lineMappings === 'object'
      ? item.mapping.lineMappings as Record<string, LineMapping>
      : {};
    const lineMappings: Record<string, LineMapping> = {};
    for (const line of item.document.lines) {
      lineMappings[String(line.odooLineId)] = {
        unitId: saved[String(line.odooLineId)]?.unitId ?? line.unitId ?? undefined,
        contractId: saved[String(line.odooLineId)]?.contractId ?? line.contractId ?? undefined,
        contractNumber: saved[String(line.odooLineId)]?.contractNumber
          ?? line.contractNumber
          ?? undefined,
        localInvoiceId: saved[String(line.odooLineId)]?.localInvoiceId
          ?? line.localInvoiceId
          ?? undefined,
        periodStart: saved[String(line.odooLineId)]?.periodStart ?? line.periodStart ?? undefined,
        periodEnd: saved[String(line.odooLineId)]?.periodEnd ?? line.periodEnd ?? undefined,
      };
    }
    mappings[item.itemId] = lineMappings;
  }
  return mappings;
}

function previewWithDocuments(
  preview: ImportPreview,
  documents: ImportPreview['documents'],
): ImportPreview {
  const lines = documents.flatMap((item) => item.document.lines);
  return {
    ...preview,
    documents,
    summary: {
      documentCount: documents.length,
      readyCount: documents.filter((item) => item.itemStatus === 'ready').length,
      reviewCount: documents.filter((item) => item.itemStatus === 'needs_review' || item.itemStatus === 'failed').length,
      lineCount: lines.length,
      matchedLineCount: lines.filter((line) => line.mappingStatus === 'matched').length,
      unmatchedLineCount: lines.filter((line) => line.mappingStatus === 'needs_review' || line.mappingStatus === 'unmatched').length,
      multiUnitCount: documents.filter((item) => (
        new Set(item.document.lines.map((line) => line.unitId).filter(Boolean)).size > 1
      )).length,
      amountTotal: documents.reduce((sum, item) => sum + item.document.amountTotal, 0),
    },
  };
}

function isLineReadyToCommit(
  line: ImportLine,
  mapping: LineMapping | undefined,
  documentAmountTotal?: number,
) {
  if (!line.isRental) return true;
  if (
    !mapping?.unitId
    || !mapping.contractId
    || !mapping.localInvoiceId
    || !mapping.periodStart
    || !mapping.periodEnd
  ) {
    return false;
  }
  const contract = line.contractOptions.find((option) => option.id === mapping.contractId);
  const invoice = contract?.invoices.find((candidate) => candidate.id === mapping.localInvoiceId);
  return Boolean(
    contract
    && contract.unitId === mapping.unitId
    && invoice
    && invoice.periodStart === mapping.periodStart
    && invoice.periodEnd === mapping.periodEnd
    && Math.abs(invoice.amountTotal - (documentAmountTotal ?? line.amountTotal)) <= 0.02,
  );
}

function singleRentalDocumentTotal(document: ImportDocument) {
  return document.lines.filter((line) => line.isRental).length === 1
    ? document.amountTotal
    : undefined;
}

function importIssueLabel(
  issue: string,
  t: ReturnType<typeof useTranslations<'units'>>,
) {
  const labels: Record<string, string> = {
    contractNumberSuggested: t('selectLocalContract'),
    contractNotMatched: t('contractNotMatched'),
    localInvoiceMissing: t('noMatchingLocalInvoice'),
    multipleLocalInvoices: t('multipleMatchingLocalInvoices'),
    amountMismatch: t('invoiceAmountMismatch'),
    unitProductNotLinked: t('unitProductNotLinked'),
    periodMissing: t('periodMissing'),
    partnerMissing: t('partnerMissing'),
    invoiceLinesMissing: t('invoiceLinesMissing'),
    existingDocumentWillUpdate: t('existingDocumentWillUpdate'),
    localInvoiceRequired: t('noMatchingLocalInvoice'),
    localInvoiceMismatch: t('localInvoiceMismatch'),
    contractNotActive: t('contractNotActive'),
    contractTenantMismatch: t('contractTenantMismatch'),
    invoiceAmountMismatch: t('invoiceAmountMismatch'),
    odooInvoiceAlreadyLinked: t('odooInvoiceAlreadyLinked'),
    odooImportDatabaseUpgradeRequired: t('odooImportDatabaseUpgradeRequired'),
    odooImportFailed: t('odooImportFailed'),
  };
  return labels[issue] ?? issue;
}

export function ImportOdooCenterClient({
  locale,
  units,
}: {
  locale: string;
  units: Unit[];
}) {
  const t = useTranslations('units');
  const tc = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const loc = locale as Locale;
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lineMappings, setLineMappings] = useState<Record<string, Record<string, LineMapping>>>({});
  const [loading, setLoading] = useState(false);
  const [restoringPreview, setRestoringPreview] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'ready' | 'review'>('all');
  const [page, setPage] = useState(1);

  const reconciliationRows = useMemo(() => {
    if (!preview) return [];
    return preview.localInvoices.map((localInvoice) => {
      const candidates = preview.documents.filter((item) => item.document.lines.some((line) => (
        line.localInvoiceId === localInvoice.id
        || (
          line.unitId === localInvoice.unitId
          && line.periodStart === localInvoice.periodStart
          && line.periodEnd === localInvoice.periodEnd
          && Math.abs(item.document.amountTotal - localInvoice.amountTotal) <= 0.02
          && line.contractOptions.some((contract) => contract.invoices.some((invoice) => (
            invoice.id === localInvoice.id
          )))
        )
      )));
      const exactMatches = candidates.filter((item) => item.document.lines.some((line) => (
        line.localInvoiceId === localInvoice.id
      )));
      const item = exactMatches.length === 1 ? exactMatches[0] : candidates.length === 1 ? candidates[0] : null;
      const result = exactMatches.length === 1
        ? localInvoice.odooInvoiceId ? 'changed' : 'ready'
        : candidates.length === 0 ? 'missing' : 'review';
      return { localInvoice, item, result };
    });
  }, [preview]);

  const relevantDocuments = useMemo(() => {
    if (!preview) return [];
    const localInvoiceIds = new Set(preview.localInvoices.map((invoice) => invoice.id));
    const localInvoicesById = new Map(preview.localInvoices.map((invoice) => [invoice.id, invoice]));
    const linkedOdooInvoiceIds = new Set(preview.localInvoices
      .map((invoice) => invoice.odooInvoiceId)
      .filter((id): id is number => id != null));
    return preview.documents.filter((item) => (
      linkedOdooInvoiceIds.has(item.document.odooInvoiceId)
      || item.document.lines.some((line) => (
        Boolean(line.localInvoiceId && localInvoiceIds.has(line.localInvoiceId))
        || line.contractOptions.some((contract) => contract.invoices.some((invoice) => (
          localInvoiceIds.has(invoice.id)
          && localInvoicesById.get(invoice.id)?.periodStart === line.periodStart
          && localInvoicesById.get(invoice.id)?.periodEnd === line.periodEnd
        )))
      ))
    ));
  }, [preview]);

  const visibleDocuments = useMemo(() => {
    if (!preview) return [];
    const term = query.trim().toLowerCase();
    return relevantDocuments.filter((item) => {
      if (filter === 'ready' && item.itemStatus !== 'ready') return false;
      if (filter === 'review' && item.itemStatus !== 'needs_review') return false;
      if (!term) return true;
      return [
        item.document.invoiceName,
        item.document.reference,
        item.document.partner.name,
        item.document.odooInvoiceId,
        ...item.document.lines.flatMap((line) => [
          line.productName,
          line.unitNumber,
          line.description,
          line.contractNumber,
          line.localInvoiceNumber,
          line.suggestedContractNumber,
          ...line.contractOptions.map((option) => option.contractNumber),
        ]),
      ].join(' ').toLowerCase().includes(term);
    });
  }, [filter, preview, query, relevantDocuments]);
  const committableSelectedIds = useMemo(() => {
    if (!preview) return new Set<string>();
    return new Set(preview.documents
      .filter((item) => (
        selectedIds.has(item.itemId)
        && item.document.lines.every((line) => (
          isLineReadyToCommit(
            line,
            lineMappings[item.itemId]?.[String(line.odooLineId)],
            singleRentalDocumentTotal(item.document),
          )
        ))
      ))
      .map((item) => item.itemId));
  }, [lineMappings, preview, selectedIds]);
  const pageCount = Math.max(1, Math.ceil(visibleDocuments.length / PAGE_SIZE));
  const pagedDocuments = visibleDocuments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    let active = true;
    const storageKey = previewSessionKey(locale);
    const runId = window.sessionStorage.getItem(storageKey);
    if (!runId) {
      queueMicrotask(() => {
        if (active) setRestoringPreview(false);
      });
      return () => {
        active = false;
      };
    }

    void getOdooInvoiceImportPreview(locale, runId)
      .then((result) => {
        if (!active) return;
        if (isFeatureDisabledResult(result)) {
          window.sessionStorage.removeItem(storageKey);
          return;
        }
        const restoredPreview = result as ImportPreview;
        if (restoredPreview.status !== 'ready') {
          window.sessionStorage.removeItem(storageKey);
          return;
        }
        const restoredMappings = initialMappings(restoredPreview);
        setPreview(restoredPreview);
        setLineMappings(restoredMappings);
        setSelectedIds(new Set(restoredPreview.documents
          .filter((item) => (
            item.itemStatus === 'ready'
            && item.document.lines.every((line) => (
              isLineReadyToCommit(
                line,
                restoredMappings[item.itemId]?.[String(line.odooLineId)],
                singleRentalDocumentTotal(item.document),
              )
            ))
          ))
          .map((item) => item.itemId)));
      })
      .catch(() => {
        if (active) window.sessionStorage.removeItem(storageKey);
      })
      .finally(() => {
        if (active) setRestoringPreview(false);
      });

    return () => {
      active = false;
    };
  }, [locale]);

  async function handlePreview() {
    setLoading(true);
    try {
      const validation = await testOdooConnection(locale);
      if (!validation.ok) throw new Error(validation.message);
      const result = await startOdooInvoiceImportPreview(locale);
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      const nextPreview = result as ImportPreview;
      window.sessionStorage.setItem(previewSessionKey(locale), nextPreview.runId);
      const nextMappings = initialMappings(nextPreview);
      setPreview(nextPreview);
      setSelectedIds(new Set(nextPreview.documents
        .filter((item) => (
          item.itemStatus === 'ready'
          && item.document.lines.every((line) => (
            isLineReadyToCommit(
              line,
              nextMappings[item.itemId]?.[String(line.odooLineId)],
              singleRentalDocumentTotal(item.document),
            )
          ))
        ))
        .map((item) => item.itemId)));
      setLineMappings(nextMappings);
      setPage(1);
      toast.success(t('odooPreviewLoaded', { count: nextPreview.localInvoices.length }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tc('error'));
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(itemId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const eligible = visibleDocuments.filter((item) => item.document.lines.every((line) => (
        isLineReadyToCommit(
          line,
          lineMappings[item.itemId]?.[String(line.odooLineId)],
          singleRentalDocumentTotal(item.document),
        )
      )));
      const allSelected = eligible.length > 0
        && eligible.every((item) => current.has(item.itemId));
      for (const item of eligible) {
        if (allSelected) next.delete(item.itemId);
        else next.add(item.itemId);
      }
      return next;
    });
  }

  function updateLineMapping(itemId: string, lineId: number, patch: Partial<LineMapping>) {
    setLineMappings((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {}),
        [String(lineId)]: {
          ...(current[itemId]?.[String(lineId)] ?? {}),
          ...patch,
        },
      },
    }));
  }

  function selectLocalContract(itemId: string, line: ImportLine, contractId: string) {
    const option = line.contractOptions.find((candidate) => candidate.id === contractId);
    const current = lineMappings[itemId]?.[String(line.odooLineId)];
    const periodStart = current?.periodStart ?? line.periodStart ?? undefined;
    const periodEnd = current?.periodEnd ?? line.periodEnd ?? undefined;
    const localInvoice = option?.invoices.find((invoice) => (
      invoice.periodStart === periodStart && invoice.periodEnd === periodEnd
    ));
    updateLineMapping(itemId, line.odooLineId, {
      contractId: option?.id,
      contractNumber: option?.contractNumber,
      localInvoiceId: localInvoice?.id,
    });
    const document = preview?.documents.find((item) => item.itemId === itemId)?.document;
    for (const serviceLine of document?.lines.filter((candidate) => !candidate.isRental) ?? []) {
      updateLineMapping(itemId, serviceLine.odooLineId, {
        contractId: option?.id,
        contractNumber: option?.contractNumber,
      });
    }
  }

  async function handleCommit() {
    if (!preview || committableSelectedIds.size === 0) return;
    setLoading(true);
    try {
      const selected = preview.documents.filter((item) => committableSelectedIds.has(item.itemId));
      const mappingResult = await updateOdooInvoiceImportMappings(locale, preview.runId, selected.map((item) => ({
        itemId: item.itemId,
        mapping: { lineMappings: lineMappings[item.itemId] ?? {} },
      })));
      if (isFeatureDisabledResult(mappingResult)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      const result = await commitOdooInvoiceImport(
        locale,
        preview.runId,
        selected.map((item) => item.itemId),
      );
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      if (result.importedCount > 0) {
        toast.success(t('odooImportCommitted', {
          documents: result.importedCount,
          contracts: result.contractCount,
        }));
      }
      if (result.errors.length > 0) {
        toast.error(t('odooLegacyImportErrors', { count: result.errors.length }));
      }
      if (result.importedCount > 0) {
        window.sessionStorage.removeItem(previewSessionKey(locale));
        const failedByItemId = new Map(result.errors.map((error) => [error.itemId, error.message]));
        const successfulItemIds = new Set(
          selected
            .map((item) => item.itemId)
            .filter((itemId) => !failedByItemId.has(itemId)),
        );
        const successfulLocalInvoiceIds = new Set(selected
          .filter((item) => successfulItemIds.has(item.itemId))
          .flatMap((item) => item.document.lines.map((line) => (
            lineMappings[item.itemId]?.[String(line.odooLineId)]?.localInvoiceId
          )))
          .filter((id): id is string => Boolean(id)));
        setPreview((current) => {
          if (!current) return current;
          const remaining = current.documents
            .filter((item) => !successfulItemIds.has(item.itemId))
            .map((item) => {
              const failure = failedByItemId.get(item.itemId);
              return failure
                ? { ...item, itemStatus: 'failed' as const, errors: [failure] }
                : item;
            });
          return {
            ...previewWithDocuments(current, remaining),
            localInvoices: current.localInvoices.filter((invoice) => (
              !successfulLocalInvoiceIds.has(invoice.id)
            )),
          };
        });
        setSelectedIds(new Set(failedByItemId.keys()));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tc('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="surface-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{t('odooImportCenter')}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t('odooImportCenterDesc')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${locale}/units`}
              className={buttonStyles({ variant: 'outline' })}
            >
              <Link2 className="h-4 w-4" />
              {t('reviewProductLinks')}
            </Link>
            <Button type="button" onClick={() => handlePreview()} disabled={loading || restoringPreview}>
              {preview ? <RefreshCw /> : <FileSearch />}
              {loading || restoringPreview ? tc('loading') : preview ? t('refreshOdooPreview') : t('validateAndPreview')}
            </Button>
          </div>
        </div>
      </div>

      {(loading || restoringPreview) && !preview && (
        <LoadingRegion label={tc('loading')} className="space-y-4">
          <StatsCardsSkeleton count={5} columns="dashboard" />
          <DocumentListSkeleton rows={4} />
        </LoadingRegion>
      )}

      {preview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              [t('localInvoicesToReconcile'), reconciliationRows.length],
              [t('readyToLink'), reconciliationRows.filter((row) => row.result === 'ready').length],
              [t('linkedStatusChanged'), reconciliationRows.filter((row) => row.result === 'changed').length],
              [t('noOdooMatch'), reconciliationRows.filter((row) => row.result === 'missing').length],
              [t('needsReview'), reconciliationRows.filter((row) => row.result === 'review').length],
            ].map(([label, value]) => (
              <div key={String(label)} className="surface-panel p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <div className="surface-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">{t('reconciliationPreview')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('reconciliationPreviewDesc')}</p>
              </div>
              <Button
                type="button"
                onClick={handleCommit}
                disabled={loading || restoringPreview || committableSelectedIds.size === 0}
              >
                <DatabaseZap />
                {t('saveSelectedOdooDocuments', { count: committableSelectedIds.size })}
              </Button>
            </div>
            <div className="grid gap-3 p-3 md:hidden">
              {reconciliationRows.map(({ localInvoice, item, result }) => {
                const canApprove = Boolean(item && (result === 'ready' || result === 'changed'));
                const resultLabel = result === 'ready'
                  ? t('readyToLink')
                  : result === 'changed'
                    ? t('linkedStatusChanged')
                    : result === 'missing'
                      ? t('noOdooMatch')
                      : t('needsReview');
                return (
                  <div key={localInvoice.id} className="mobile-card">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{localInvoice.invoiceNumber}</p>
                        <p className="text-sm text-muted-foreground">{localInvoice.unitNumber}</p>
                      </div>
                      <Badge
                        status={canApprove ? 'success' : 'pending'}
                        label={resultLabel}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t('contractNumber')}</p>
                        <p>{localInvoice.contractNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t('amount')}</p>
                        <p>{formatCurrency(localInvoice.amountTotal, loc)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">{t('odooInvoice')}</p>
                        <p>{item?.document.invoiceName ?? '—'}</p>
                      </div>
                    </div>
                    {canApprove && item && (
                      <label className="mt-3 flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.itemId)}
                          onChange={() => toggleItem(item.itemId)}
                        />
                        {t('select')}
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>{t('select')}</th>
                    <th>{t('localInvoice')}</th>
                    <th>{t('contractNumber')}</th>
                    <th>{t('period')}</th>
                    <th>{t('amount')}</th>
                    <th>{t('odooInvoice')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationRows.map(({ localInvoice, item, result }) => {
                    const canApprove = Boolean(item && (result === 'ready' || result === 'changed'));
                    return (
                      <tr key={localInvoice.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(item && selectedIds.has(item.itemId))}
                            disabled={!canApprove}
                            onChange={() => item && toggleItem(item.itemId)}
                            aria-label={t('select')}
                          />
                        </td>
                        <td>
                          <p className="font-medium">{localInvoice.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">{localInvoice.unitNumber}</p>
                        </td>
                        <td>
                          <p>{localInvoice.contractNumber}</p>
                          <p className="text-xs text-muted-foreground">{localInvoice.tenantName ?? '—'}</p>
                        </td>
                        <td className="whitespace-nowrap">
                          {localInvoice.periodStart} → {localInvoice.periodEnd}
                        </td>
                        <td>{formatCurrency(localInvoice.amountTotal, loc)}</td>
                        <td>{item?.document.invoiceName ?? '—'}</td>
                        <td>
                          <Badge
                            status={result === 'ready' || result === 'changed' ? 'success' : 'pending'}
                            label={result === 'ready'
                              ? t('readyToLink')
                              : result === 'changed'
                                ? t('linkedStatusChanged')
                                : result === 'missing'
                                  ? t('noOdooMatch')
                                  : t('needsReview')}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="surface-panel overflow-hidden">
            <div className="space-y-3 border-b border-border p-4">
              <div>
                <h3 className="font-semibold">{t('odooCandidateDetails')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('odooCandidateDetailsDesc')}</p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder={t('searchOdooDocuments')}
                  className="field-control mt-0 max-w-xl"
                />
                <div className="filter-group">
                  {([
                    ['all', t('allInvoices'), relevantDocuments.length],
                    ['ready', tc('valid'), relevantDocuments.filter((item) => item.itemStatus === 'ready').length],
                    ['review', t('needsReview'), relevantDocuments.filter((item) => item.itemStatus === 'needs_review').length],
                  ] as const).map(([key, label, count]) => (
                    <Button
                      key={key}
                      type="button"
                      variant={filter === key ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setFilter(key);
                        setPage(1);
                      }}
                    >
                      {label} {count}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={toggleVisible}>
                  {t('toggleVisibleProducts')}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {pagedDocuments.map((item) => {
                const unitIds = new Set(item.document.lines.map((line) => line.unitId).filter(Boolean));
                const itemReady = item.document.lines.every((line) => (
                  isLineReadyToCommit(
                    line,
                    lineMappings[item.itemId]?.[String(line.odooLineId)],
                    singleRentalDocumentTotal(item.document),
                  )
                ));
                const localMatches = item.document.lines.flatMap((line) => {
                  const mapping = lineMappings[item.itemId]?.[String(line.odooLineId)];
                  const contract = line.contractOptions.find((option) => option.id === mapping?.contractId);
                  const invoice = contract?.invoices.find((candidate) => candidate.id === mapping?.localInvoiceId);
                  return contract && invoice ? [{ contract, invoice }] : [];
                });
                return (
                  <details key={item.itemId} className="group">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 hover:bg-muted/30 sm:flex-row sm:items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.itemId)}
                        onChange={() => toggleItem(item.itemId)}
                        onClick={(event) => event.stopPropagation()}
                        disabled={!itemReady}
                        className="h-4 w-4"
                        aria-label={t('select')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{item.document.invoiceName}</span>
                          <Badge
                            status={itemReady ? 'success' : 'pending'}
                            label={itemReady ? tc('valid') : t('needsReview')}
                          />
                          {unitIds.size > 1 && <Badge status="pending" label={t('multiUnitInvoice')} />}
                          <Badge status="linked" label={item.document.moveState} />
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {item.document.partner.name} · {item.document.invoiceDate ?? '—'}
                        </p>
                        {localMatches.map(({ contract, invoice }) => (
                          <p key={invoice.id} className="mt-1 text-xs font-medium text-primary">
                            {t('invoiceMatchSummary', {
                              odoo: item.document.invoiceName,
                              local: invoice.invoiceNumber,
                              contract: contract.contractNumber,
                            })}
                          </p>
                        ))}
                      </div>
                      <div className="text-start sm:text-end">
                        <p className="font-semibold tabular-nums">{formatCurrency(item.document.amountTotal, loc)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('paidAmount')}: {formatCurrency(item.document.amountPaid, loc)}
                        </p>
                      </div>
                    </summary>

                    <div className="border-t border-border bg-muted/20 p-4">
                      {item.errors.length > 0 && !itemReady && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{item.errors.map((error) => importIssueLabel(error, t)).join(' · ')}</span>
                        </div>
                      )}
                      <div className="space-y-3">
                        {item.document.lines.map((line) => {
                          const mapping = lineMappings[item.itemId]?.[String(line.odooLineId)] ?? {};
                          const selectedContract = line.contractOptions.find((option) => option.id === mapping.contractId);
                          const selectedLocalInvoice = selectedContract?.invoices.find((invoice) => (
                            invoice.id === mapping.localInvoiceId
                          ));
                          const lineReady = isLineReadyToCommit(
                            line,
                            mapping,
                            singleRentalDocumentTotal(item.document),
                          );
                          return (
                            <div key={line.odooLineId} className="rounded-lg border border-border bg-background p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium">{line.productName ?? line.description ?? `#${line.odooLineId}`}</p>
                                    <Badge
                                      status={lineReady ? 'success' : line.mappingStatus === 'service' ? 'vacant' : 'pending'}
                                      label={line.mappingStatus === 'service' ? t('serviceLine') : lineReady ? t('linked') : t('needsReview')}
                                    />
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">{line.description}</p>
                                </div>
                                <p className="font-medium tabular-nums">{formatCurrency(line.amountTotal, loc)}</p>
                              </div>

                              {line.isRental ? (
                                <div className="mt-3 space-y-3">
                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div>
                                    <label className="text-xs font-medium">{t('unitNumber')}</label>
                                    <select
                                      value={mapping.unitId ?? ''}
                                      onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, {
                                        unitId: event.target.value || undefined,
                                        contractId: undefined,
                                        contractNumber: undefined,
                                        localInvoiceId: undefined,
                                      })}
                                      className="field-control mt-1"
                                    >
                                      <option value="">{t('notLinked')}</option>
                                      {units.map((unit) => (
                                        <option key={unit.id} value={unit.id}>
                                          {unit.location?.name_en} · {unit.unit_number}
                                        </option>
                                      ))}
                                    </select>
                                    </div>
                                    <div>
                                    <label className="text-xs font-medium">{t('contractNumber')}</label>
                                    <select
                                      value={mapping.contractId ?? ''}
                                      onChange={(event) => selectLocalContract(item.itemId, line, event.target.value)}
                                      className="field-control mt-1"
                                    >
                                      <option value="">{t('selectLocalContract')}</option>
                                      {line.contractOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.contractNumber} · {option.tenantName ?? option.unitNumber}
                                        </option>
                                      ))}
                                    </select>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {selectedLocalInvoice
                                        ? t('matchedLocalInvoice', { number: selectedLocalInvoice.invoiceNumber })
                                        : t('noMatchingLocalInvoice')}
                                    </p>
                                    </div>
                                    <div>
                                    <label className="text-xs font-medium">{t('periodStart')}</label>
                                    <input
                                      type="date"
                                      value={mapping.periodStart ?? ''}
                                      onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, {
                                        periodStart: event.target.value,
                                        localInvoiceId: undefined,
                                      })}
                                      className="field-control mt-1"
                                    />
                                    </div>
                                    <div>
                                    <label className="text-xs font-medium">{t('periodEnd')}</label>
                                    <input
                                      type="date"
                                      value={mapping.periodEnd ?? ''}
                                      onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, {
                                        periodEnd: event.target.value,
                                        localInvoiceId: undefined,
                                      })}
                                      className="field-control mt-1"
                                    />
                                    </div>
                                  </div>
                                  {selectedContract && selectedLocalInvoice && (
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                                      <span className="font-medium">{t('odooInvoice')}</span>
                                      <span className="font-semibold" dir="auto">{item.document.invoiceName}</span>
                                      <span className="text-primary" aria-hidden="true">→</span>
                                      <span className="font-medium">{t('localInvoice')}</span>
                                      <span className="font-semibold" dir="auto">{selectedLocalInvoice.invoiceNumber}</span>
                                      <span className="text-muted-foreground">·</span>
                                      <span className="text-muted-foreground">
                                        {selectedLocalInvoice.periodStart} → {selectedLocalInvoice.periodEnd}
                                      </span>
                                      <span className="text-muted-foreground">·</span>
                                      <span className="font-medium tabular-nums">
                                        {formatCurrency(selectedLocalInvoice.amountTotal, loc)}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {t('contractMatchLabel', { contract: selectedContract.contractNumber })}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-3 max-w-md">
                                  <label className="text-xs font-medium">{t('contractNumber')}</label>
                                  <input
                                    value={mapping.contractNumber ?? ''}
                                    readOnly
                                    className="field-control mt-1"
                                    placeholder={t('attachServiceToContract')}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            {visibleDocuments.length === 0 && (
              <div className="px-4 py-12 text-center text-muted-foreground">{tc('noResults')}</div>
            )}

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {page} / {pageCount}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label={tc('previous')}>
                  <ChevronLeft />
                </Button>
                <Button type="button" variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} aria-label={tc('next')}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('odooImportSourceOfTruth')}</p>
          </div>
        </>
      )}
    </div>
  );
}
