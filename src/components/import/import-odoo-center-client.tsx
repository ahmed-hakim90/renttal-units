'use client';

import { useMemo, useState } from 'react';
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
  startOdooIncrementalImportPreview,
  startOdooInvoiceImportPreview,
  testOdooConnection,
  updateOdooInvoiceImportMappings,
} from '@/lib/actions/odoo';
import { isFeatureDisabledResult } from '@/lib/features';
import { formatCurrency } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { Unit } from '@/types/database';

type ImportLine = {
  odooLineId: number;
  productOdooId: number | null;
  productName: string | null;
  unitId: string | null;
  unitNumber: string | null;
  description: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  isRental: boolean;
  mappingStatus: 'matched' | 'unmatched' | 'needs_review' | 'service';
  reviewReason: string | null;
  suggestedContractNumber: string | null;
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
};

type LineMapping = {
  unitId?: string;
  contractNumber?: string;
  periodStart?: string;
  periodEnd?: string;
};

const PAGE_SIZE = 20;

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
        contractNumber: saved[String(line.odooLineId)]?.contractNumber
          ?? line.suggestedContractNumber
          ?? undefined,
        periodStart: saved[String(line.odooLineId)]?.periodStart ?? line.periodStart ?? undefined,
        periodEnd: saved[String(line.odooLineId)]?.periodEnd ?? line.periodEnd ?? undefined,
      };
    }
    mappings[item.itemId] = lineMappings;
  }
  return mappings;
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
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'ready' | 'review'>('all');
  const [page, setPage] = useState(1);

  const visibleDocuments = useMemo(() => {
    if (!preview) return [];
    const term = query.trim().toLowerCase();
    return preview.documents.filter((item) => {
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
          line.suggestedContractNumber,
        ]),
      ].join(' ').toLowerCase().includes(term);
    });
  }, [filter, preview, query]);
  const pageCount = Math.max(1, Math.ceil(visibleDocuments.length / PAGE_SIZE));
  const pagedDocuments = visibleDocuments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handlePreview(mode: 'full' | 'incremental' = 'full') {
    setLoading(true);
    try {
      const validation = await testOdooConnection(locale);
      if (!validation.ok) throw new Error(validation.message);
      const result = mode === 'incremental'
        ? await startOdooIncrementalImportPreview(locale)
        : await startOdooInvoiceImportPreview(locale);
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      const nextPreview = result as ImportPreview;
      setPreview(nextPreview);
      setSelectedIds(new Set(nextPreview.documents
        .filter((item) => item.itemStatus === 'ready')
        .map((item) => item.itemId)));
      setLineMappings(initialMappings(nextPreview));
      setPage(1);
      toast.success(t('odooPreviewLoaded', { count: nextPreview.summary.documentCount }));
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
      const allSelected = visibleDocuments.length > 0
        && visibleDocuments.every((item) => current.has(item.itemId));
      for (const item of visibleDocuments) {
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

  async function handleCommit() {
    if (!preview || selectedIds.size === 0) return;
    setLoading(true);
    try {
      const selected = preview.documents.filter((item) => selectedIds.has(item.itemId));
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
      toast.success(t('odooImportCommitted', {
        documents: result.importedCount,
        contracts: result.contractCount,
      }));
      if (result.errors.length > 0) {
        toast.error(t('odooLegacyImportErrors', { count: result.errors.length }));
      }
      setSelectedIds(new Set());
      await handlePreview('incremental');
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
            {preview && (
              <Button type="button" variant="outline" onClick={() => handlePreview('incremental')} disabled={loading}>
                <RefreshCw />
                {t('syncOdooChanges')}
              </Button>
            )}
            <Button type="button" onClick={() => handlePreview('full')} disabled={loading}>
              {preview ? <RefreshCw /> : <FileSearch />}
              {loading ? tc('loading') : preview ? t('refreshOdooPreview') : t('validateAndPreview')}
            </Button>
          </div>
        </div>
      </div>

      {loading && !preview && (
        <LoadingRegion label={tc('loading')} className="space-y-4">
          <StatsCardsSkeleton count={5} columns="dashboard" />
          <DocumentListSkeleton rows={4} />
        </LoadingRegion>
      )}

      {preview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              [t('odooDocuments'), preview.summary.documentCount],
              [t('matchedLines'), preview.summary.matchedLineCount],
              [t('needsReview'), preview.summary.reviewCount],
              [t('multiUnitInvoices'), preview.summary.multiUnitCount],
              [t('amount'), formatCurrency(preview.summary.amountTotal, loc)],
            ].map(([label, value]) => (
              <div key={String(label)} className="surface-panel p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <div className="surface-panel overflow-hidden">
            <div className="space-y-3 border-b border-border p-4">
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
                    ['all', t('allInvoices'), preview.summary.documentCount],
                    ['ready', tc('valid'), preview.summary.readyCount],
                    ['review', t('needsReview'), preview.summary.reviewCount],
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
                <Button type="button" onClick={handleCommit} disabled={loading || selectedIds.size === 0}>
                  <DatabaseZap />
                  {t('saveSelectedOdooDocuments', { count: selectedIds.size })}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {pagedDocuments.map((item) => {
                const unitIds = new Set(item.document.lines.map((line) => line.unitId).filter(Boolean));
                return (
                  <details key={item.itemId} className="group">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 hover:bg-muted/30 sm:flex-row sm:items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.itemId)}
                        onChange={() => toggleItem(item.itemId)}
                        onClick={(event) => event.stopPropagation()}
                        className="h-4 w-4"
                        aria-label={t('select')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{item.document.invoiceName}</span>
                          <Badge
                            status={item.itemStatus === 'ready' ? 'success' : 'pending'}
                            label={item.itemStatus === 'ready' ? tc('valid') : t('needsReview')}
                          />
                          {unitIds.size > 1 && <Badge status="pending" label={t('multiUnitInvoice')} />}
                          <Badge status="linked" label={item.document.moveState} />
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {item.document.partner.name} · {item.document.invoiceDate ?? '—'}
                        </p>
                      </div>
                      <div className="text-start sm:text-end">
                        <p className="font-semibold tabular-nums">{formatCurrency(item.document.amountTotal, loc)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('paidAmount')}: {formatCurrency(item.document.amountPaid, loc)}
                        </p>
                      </div>
                    </summary>

                    <div className="border-t border-border bg-muted/20 p-4">
                      {item.errors.length > 0 && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{item.errors.join(' · ')}</span>
                        </div>
                      )}
                      <div className="space-y-3">
                        {item.document.lines.map((line) => {
                          const mapping = lineMappings[item.itemId]?.[String(line.odooLineId)] ?? {};
                          return (
                            <div key={line.odooLineId} className="rounded-lg border border-border bg-background p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium">{line.productName ?? line.description ?? `#${line.odooLineId}`}</p>
                                    <Badge
                                      status={line.mappingStatus === 'matched' ? 'success' : line.mappingStatus === 'service' ? 'vacant' : 'pending'}
                                      label={line.mappingStatus === 'service' ? t('serviceLine') : line.mappingStatus === 'matched' ? t('linked') : t('needsReview')}
                                    />
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">{line.description}</p>
                                </div>
                                <p className="font-medium tabular-nums">{formatCurrency(line.amountTotal, loc)}</p>
                              </div>

                              {line.isRental ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-4">
                                  <div>
                                    <label className="text-xs font-medium">{t('unitNumber')}</label>
                                    <select
                                      value={mapping.unitId ?? ''}
                                      onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, { unitId: event.target.value || undefined })}
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
                                    <input
                                      value={mapping.contractNumber ?? ''}
                                      onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, { contractNumber: event.target.value })}
                                      className="field-control mt-1"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium">{t('periodStart')}</label>
                                    <input
                                      type="date"
                                      value={mapping.periodStart ?? ''}
                                      onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, { periodStart: event.target.value })}
                                      className="field-control mt-1"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium">{t('periodEnd')}</label>
                                    <input
                                      type="date"
                                      value={mapping.periodEnd ?? ''}
                                      onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, { periodEnd: event.target.value })}
                                      className="field-control mt-1"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-3 max-w-md">
                                  <label className="text-xs font-medium">{t('contractNumber')}</label>
                                  <input
                                    value={mapping.contractNumber ?? ''}
                                    onChange={(event) => updateLineMapping(item.itemId, line.odooLineId, { contractNumber: event.target.value })}
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
