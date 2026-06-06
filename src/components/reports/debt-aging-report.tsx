'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/hooks';
import { Download } from 'lucide-react';
import {
  AGING_BUCKET_KEYS,
  type AgingBucketKey,
  buildAgingRows,
  buildBucketSummary,
  buildUnitAgingSummary,
  sumBucketAmounts,
} from '@/lib/rental/aging';
import type { Invoice, Location } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

function getLocationName(invoice: Invoice, locale: string): string {
  const location = invoice.unit?.location;
  if (!location) return '—';
  return locale === 'ar'
    ? location.name_ar || location.name_en
    : location.name_en || location.name_ar;
}

function formatPeriod(start: string, end: string, loc: Locale): string {
  return `${formatDate(start, loc)} – ${formatDate(end, loc)}`;
}

function AmountCell({ value, locale, bold = false }: { value: number; locale: Locale; bold?: boolean }) {
  if (value <= 0) {
    return <td className="px-3 py-2.5 text-end text-muted-foreground">—</td>;
  }
  return (
    <td className={`px-3 py-2.5 text-end tabular-nums ${bold ? 'font-semibold' : ''}`}>
      {formatCurrency(value, locale)}
    </td>
  );
}

export function DebtAgingReport({
  invoices,
  locations,
  locale,
}: {
  invoices: Invoice[];
  locations: Location[];
  locale: string;
}) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const ts = useTranslations('common.status');
  const loc = locale as Locale;
  const asOfDate = useMemo(() => new Date(), []);
  const [locationId, setLocationId] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');

  const rows = useMemo(() => {
    return buildAgingRows(invoices, asOfDate)
      .filter((row) => !locationId || row.invoice.unit?.location_id === locationId)
      .filter((row) => !bucketFilter || row.bucket === bucketFilter)
      .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.invoice.unit?.unit_number ?? '').localeCompare(b.invoice.unit?.unit_number ?? ''));
  }, [asOfDate, bucketFilter, invoices, locationId]);

  const bucketSummary = useMemo(() => buildBucketSummary(rows), [rows]);
  const unitSummary = useMemo(
    () => buildUnitAgingSummary(rows, (invoice) => getLocationName(invoice, locale)),
    [locale, rows],
  );
  const bucketTotals = useMemo(() => sumBucketAmounts(rows), [rows]);
  const totalAmount = rows.reduce((sum, row) => sum + row.remaining, 0);
  const totalInvoices = rows.length;
  const totalUnits = unitSummary.length;

  const groupedRows = useMemo(() => {
    return AGING_BUCKET_KEYS.map((bucket) => ({
      bucket,
      rows: rows.filter((row) => row.bucket === bucket),
    })).filter((group) => group.rows.length > 0);
  }, [rows]);

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const asOf = asOfDate.toISOString().slice(0, 10);

    const summaryData = unitSummary.map((unit) => ({
      [t('unit')]: unit.unitNumber,
      [t('tenant')]: unit.tenantName,
      [t('location')]: unit.locationName,
      [t('paymentCycle')]: unit.paymentCycle ? tc(`paymentCycle.${unit.paymentCycle}`) : '—',
      [t('current')]: unit.buckets.current || '',
      [t('days1to30')]: unit.buckets.days1to30 || '',
      [t('days31to60')]: unit.buckets.days31to60 || '',
      [t('days61to90')]: unit.buckets.days61to90 || '',
      [t('over90')]: unit.buckets.over90 || '',
      [t('total')]: unit.total,
      [t('invoiceCount')]: unit.invoiceCount,
    }));

    summaryData.push({
      [t('unit')]: t('grandTotal'),
      [t('tenant')]: '',
      [t('location')]: '',
      [t('paymentCycle')]: '',
      [t('current')]: bucketTotals.current || '',
      [t('days1to30')]: bucketTotals.days1to30 || '',
      [t('days31to60')]: bucketTotals.days31to60 || '',
      [t('days61to90')]: bucketTotals.days61to90 || '',
      [t('over90')]: bucketTotals.over90 || '',
      [t('total')]: totalAmount,
      [t('invoiceCount')]: totalInvoices,
    });

    const detailData = rows.map((row) => ({
      [t('bucket')]: t(row.bucket),
      [t('invoiceNumber')]: row.invoice.invoice_number,
      [t('unit')]: row.invoice.unit?.unit_number ?? '',
      [t('tenant')]: row.invoice.tenant?.full_name ?? row.invoice.unit?.tenant?.full_name ?? '',
      [t('location')]: getLocationName(row.invoice, locale),
      [t('paymentCycle')]: row.invoice.unit?.payment_cycle
        ? tc(`paymentCycle.${row.invoice.unit.payment_cycle}`)
        : '',
      [t('period')]: `${row.invoice.period_start} – ${row.invoice.period_end}`,
      [t('dueDate')]: row.invoice.due_date,
      [t('daysOverdue')]: row.daysOverdue,
      [t('amount')]: Number(row.invoice.amount),
      [t('paidAmount')]: Number(row.invoice.paid_amount),
      [t('remainingAmount')]: row.remaining,
      [t('status')]: ts(row.invoice.status),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), t('summaryByUnit'));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailData), t('invoiceDetails'));
    XLSX.writeFile(workbook, `debt-aging-${asOf}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t('asOfDate')}: <span className="font-medium text-foreground">{formatDate(asOfDate, loc)}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t('debtAgingNote')}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">{t('filterByLocation')}</label>
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
              >
                <option value="">{t('allLocations')}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {locale === 'ar' ? location.name_ar : location.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('bucket')}</label>
              <select
                value={bucketFilter}
                onChange={(event) => setBucketFilter(event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
              >
                <option value="">{t('allBuckets')}</option>
                {AGING_BUCKET_KEYS.map((bucket) => (
                  <option key={bucket} value={bucket}>{t(bucket)}</option>
                ))}
              </select>
            </div>
          </div>
          <Button type="button" onClick={exportExcel} disabled={rows.length === 0}>
            <Download className="h-4 w-4" />
            {t('exportReport')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {bucketSummary.map((bucket) => (
          <Card key={bucket.bucket}>
            <CardTitle className="text-sm text-muted-foreground">{t(bucket.bucket)}</CardTitle>
            <p className="mt-2 text-2xl font-bold">{bucket.count}</p>
            <p className="text-sm font-medium">{formatCurrency(bucket.totalAmount, loc)}</p>
            <p className="text-xs text-muted-foreground">
              {formatNumber(Math.round(bucket.percentage), loc)}%
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle className="text-sm text-muted-foreground">{t('totalOutstanding')}</CardTitle>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(totalAmount, loc)}</p>
        </Card>
        <Card>
          <CardTitle className="text-sm text-muted-foreground">{t('totalInvoices')}</CardTitle>
          <p className="mt-2 text-3xl font-bold">{formatNumber(totalInvoices, loc)}</p>
        </Card>
        <Card>
          <CardTitle className="text-sm text-muted-foreground">{t('totalUnits')}</CardTitle>
          <p className="mt-2 text-3xl font-bold">{formatNumber(totalUnits, loc)}</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t('noData')}</p>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-6 py-4">
              <CardTitle>{t('summaryByUnit')}</CardTitle>
              <CardDescription className="mt-1">{t('summaryByUnitDesc')}</CardDescription>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('unit')}</th>
                    <th className="px-4 py-3 text-start">{t('tenant')}</th>
                    <th className="px-4 py-3 text-start">{t('location')}</th>
                    <th className="px-4 py-3 text-start">{t('paymentCycle')}</th>
                    {AGING_BUCKET_KEYS.map((bucket) => (
                      <th key={bucket} className="px-3 py-3 text-end">{t(bucket)}</th>
                    ))}
                    <th className="px-3 py-3 text-end">{t('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {unitSummary.map((unit) => (
                    <tr key={unit.unitId} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{unit.unitNumber}</td>
                      <td className="px-4 py-3">{unit.tenantName}</td>
                      <td className="px-4 py-3">{unit.locationName}</td>
                      <td className="px-4 py-3">
                        {unit.paymentCycle ? tc(`paymentCycle.${unit.paymentCycle}`) : '—'}
                      </td>
                      {AGING_BUCKET_KEYS.map((bucket) => (
                        <AmountCell key={bucket} value={unit.buckets[bucket]} locale={loc} />
                      ))}
                      <AmountCell value={unit.total} locale={loc} bold />
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    <td className="px-4 py-3" colSpan={4}>{t('grandTotal')}</td>
                    {AGING_BUCKET_KEYS.map((bucket) => (
                      <AmountCell key={bucket} value={bucketTotals[bucket]} locale={loc} bold />
                    ))}
                    <AmountCell value={totalAmount} locale={loc} bold />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-6 py-4">
              <CardTitle>{t('invoiceDetails')}</CardTitle>
              <CardDescription className="mt-1">{t('invoiceDetailsDesc')}</CardDescription>
            </div>

            <div className="grid gap-3 p-4 md:hidden">
              {groupedRows.map((group) => (
                <div key={group.bucket} className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-2">
                    <p className="font-semibold">{t(group.bucket)}</p>
                    <p className="text-sm font-medium">
                      {formatCurrency(group.rows.reduce((sum, row) => sum + row.remaining, 0), loc)}
                    </p>
                  </div>
                  {group.rows.map((row) => (
                    <Card key={row.invoice.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{row.invoice.invoice_number}</p>
                          <p className="text-sm text-muted-foreground">
                            {row.invoice.unit?.unit_number ?? '—'} · {row.invoice.tenant?.full_name ?? '—'}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold">{formatCurrency(row.remaining, loc)}</p>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('period')}</p>
                          <p>{formatPeriod(row.invoice.period_start, row.invoice.period_end, loc)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('dueDate')}</p>
                          <p>{formatDate(row.invoice.due_date, loc)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('daysOverdue')}</p>
                          <p>{formatNumber(row.daysOverdue, loc)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('status')}</p>
                          <p>{ts(row.invoice.status)}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('invoiceNumber')}</th>
                    <th className="px-4 py-3 text-start">{t('unit')}</th>
                    <th className="px-4 py-3 text-start">{t('tenant')}</th>
                    <th className="px-4 py-3 text-start">{t('location')}</th>
                    <th className="px-4 py-3 text-start">{t('period')}</th>
                    <th className="px-4 py-3 text-start">{t('dueDate')}</th>
                    <th className="px-4 py-3 text-end">{t('daysOverdue')}</th>
                    <th className="px-4 py-3 text-end">{t('amount')}</th>
                    <th className="px-4 py-3 text-end">{t('paidAmount')}</th>
                    <th className="px-4 py-3 text-end">{t('remainingAmount')}</th>
                    <th className="px-4 py-3 text-start">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((group) => (
                    <BucketDetailGroup
                      key={group.bucket}
                      bucket={group.bucket}
                      rows={group.rows}
                      locale={loc}
                      t={t}
                      ts={ts}
                    />
                  ))}
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    <td className="px-4 py-3" colSpan={7}>{t('grandTotal')}</td>
                    <td className="px-4 py-3 text-end tabular-nums" colSpan={3}>
                      {formatCurrency(totalAmount, loc)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function BucketDetailGroup({
  bucket,
  rows,
  locale,
  t,
  ts,
}: {
  bucket: AgingBucketKey;
  rows: ReturnType<typeof buildAgingRows>;
  locale: Locale;
  t: ReturnType<typeof useTranslations<'reports'>>;
  ts: ReturnType<typeof useTranslations<'common.status'>>;
}) {
  const subtotal = rows.reduce((sum, row) => sum + row.remaining, 0);

  return (
    <>
      <tr className="bg-muted/40">
        <td className="px-4 py-2.5 font-semibold" colSpan={11}>
          {t(bucket)} · {rows.length} {t('invoicesLabel')} · {formatCurrency(subtotal, locale)}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.invoice.id} className="border-t border-border">
          <td className="px-4 py-3">{row.invoice.invoice_number}</td>
          <td className="px-4 py-3">{row.invoice.unit?.unit_number ?? '—'}</td>
          <td className="px-4 py-3">{row.invoice.tenant?.full_name ?? row.invoice.unit?.tenant?.full_name ?? '—'}</td>
          <td className="px-4 py-3">
            {row.invoice.unit?.location
              ? locale === 'ar'
                ? row.invoice.unit.location.name_ar || row.invoice.unit.location.name_en
                : row.invoice.unit.location.name_en || row.invoice.unit.location.name_ar
              : '—'}
          </td>
          <td className="px-4 py-3">{formatPeriod(row.invoice.period_start, row.invoice.period_end, locale)}</td>
          <td className="px-4 py-3">{formatDate(row.invoice.due_date, locale)}</td>
          <td className="px-4 py-3 text-end tabular-nums">{formatNumber(row.daysOverdue, locale)}</td>
          <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(row.invoice.amount), locale)}</td>
          <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(row.invoice.paid_amount), locale)}</td>
          <td className="px-4 py-3 text-end tabular-nums font-medium">{formatCurrency(row.remaining, locale)}</td>
          <td className="px-4 py-3">{ts(row.invoice.status)}</td>
        </tr>
      ))}
    </>
  );
}
