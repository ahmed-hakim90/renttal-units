'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/i18n/hooks';
import { Download } from 'lucide-react';
import type { DebtAgingBucket, Invoice, Location } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

const bucketKeys = ['current', 'days1to30', 'days31to60', 'days61to90', 'over90'] as const;
type BucketKey = (typeof bucketKeys)[number];

function getDaysOverdue(dueDate: string): number {
  const today = new Date();
  const due = new Date(dueDate);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

function getBucketKey(daysOverdue: number): BucketKey {
  if (daysOverdue === 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'over90';
}

function remainingAmount(invoice: Invoice): number {
  return Number(invoice.amount) - Number(invoice.paid_amount);
}

export function DebtAgingReport({
  buckets,
  locations,
  locale,
}: {
  buckets: DebtAgingBucket[];
  locations: Location[];
  locale: string;
}) {
  const t = useTranslations('reports');
  const tc = useTranslations('common.status');
  const loc = locale as Locale;
  const [locationId, setLocationId] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');

  const allInvoices = useMemo(() => buckets.flatMap((bucket) => bucket.invoices), [buckets]);

  const rows = useMemo(() => {
    return allInvoices
      .map((invoice) => {
        const daysOverdue = getDaysOverdue(invoice.due_date);
        const bucket = getBucketKey(daysOverdue);
        return {
          invoice,
          daysOverdue,
          bucket,
          remaining: remainingAmount(invoice),
        };
      })
      .filter((row) => row.remaining > 0)
      .filter((row) => !locationId || row.invoice.unit?.location_id === locationId)
      .filter((row) => !bucketFilter || row.bucket === bucketFilter)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [allInvoices, bucketFilter, locationId]);

  const summary = bucketKeys.map((bucket) => {
    const bucketRows = rows.filter((row) => row.bucket === bucket);
    return {
      bucket,
      count: bucketRows.length,
      totalAmount: bucketRows.reduce((sum, row) => sum + row.remaining, 0),
    };
  });

  const totalAmount = rows.reduce((sum, row) => sum + row.remaining, 0);

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const data = rows.map((row) => ({
      Bucket: t(row.bucket),
      'Invoice Number': row.invoice.invoice_number,
      Unit: row.invoice.unit?.unit_number ?? '',
      Location: locale === 'ar'
        ? row.invoice.unit?.location?.name_ar ?? row.invoice.unit?.location?.name_en ?? ''
        : row.invoice.unit?.location?.name_en ?? row.invoice.unit?.location?.name_ar ?? '',
      'Due Date': row.invoice.due_date,
      'Days Overdue': row.daysOverdue,
      Amount: Number(row.invoice.amount),
      'Paid Amount': Number(row.invoice.paid_amount),
      'Remaining Amount': row.remaining,
      Status: tc(row.invoice.status),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Debt Aging');
    XLSX.writeFile(workbook, `debt-aging-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
              {bucketKeys.map((bucket) => (
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summary.map((bucket) => (
          <Card key={bucket.bucket}>
            <CardTitle className="text-sm text-muted-foreground">{t(bucket.bucket)}</CardTitle>
            <p className="mt-2 text-2xl font-bold">{bucket.count}</p>
            <p className="text-sm text-muted-foreground">{formatCurrency(bucket.totalAmount, loc)}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>{t('totalOutstanding')}</CardTitle>
        <p className="mt-2 text-3xl font-bold">{formatCurrency(totalAmount, loc)}</p>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t('noData')}</p>
      ) : (
        <div className="rounded-2xl border border-border overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start">{t('bucket')}</th>
                <th className="px-4 py-3 text-start">{t('invoiceNumber')}</th>
                <th className="px-4 py-3 text-start">{t('unit')}</th>
                <th className="px-4 py-3 text-start">{t('location')}</th>
                <th className="px-4 py-3 text-start">{t('dueDate')}</th>
                <th className="px-4 py-3 text-start">{t('daysOverdue')}</th>
                <th className="px-4 py-3 text-start">{t('amount')}</th>
                <th className="px-4 py-3 text-start">{t('paidAmount')}</th>
                <th className="px-4 py-3 text-start">{t('remainingAmount')}</th>
                <th className="px-4 py-3 text-start">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.invoice.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{t(row.bucket)}</td>
                  <td className="px-4 py-3">{row.invoice.invoice_number}</td>
                  <td className="px-4 py-3">{row.invoice.unit?.unit_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    {locale === 'ar'
                      ? row.invoice.unit?.location?.name_ar ?? row.invoice.unit?.location?.name_en ?? '—'
                      : row.invoice.unit?.location?.name_en ?? row.invoice.unit?.location?.name_ar ?? '—'}
                  </td>
                  <td className="px-4 py-3">{formatDate(row.invoice.due_date, loc)}</td>
                  <td className="px-4 py-3">{row.daysOverdue}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(row.invoice.amount), loc)}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(row.invoice.paid_amount), loc)}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(row.remaining, loc)}</td>
                  <td className="px-4 py-3">{tc(row.invoice.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
