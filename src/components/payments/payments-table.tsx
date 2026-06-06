'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Download, FileText, Landmark, Receipt, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/i18n/hooks';
import type { Payment, PaymentMethod } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

const paymentMethods: PaymentMethod[] = ['cash', 'bank_transfer', 'check', 'other'];
const pageSize = 10;

function toDateInputValue(date: string) {
  return new Date(date).toISOString().slice(0, 10);
}

function getLocationName(payment: Payment, locale: string) {
  const location = payment.invoice?.unit?.location;
  if (!location) return '';
  return locale === 'ar'
    ? location.name_ar ?? location.name_en
    : location.name_en ?? location.name_ar;
}

function getUnitNumber(payment: Payment) {
  return payment.invoice?.unit?.unit_number ?? '';
}

function getInvoiceNumber(payment: Payment) {
  return payment.invoice?.invoice_number ?? payment.invoice_id;
}

export function PaymentsTable({ payments, locale }: { payments: Payment[]; locale: string }) {
  const t = useTranslations('payments');
  const tc = useTranslations('common');
  const loc = locale as Locale;
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const filteredPayments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return payments.filter((payment) => {
      const paymentDate = toDateInputValue(payment.payment_date);
      const haystack = [
        getInvoiceNumber(payment),
        getUnitNumber(payment),
        getLocationName(payment, locale),
        payment.reference_number ?? '',
        payment.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!normalizedSearch || haystack.includes(normalizedSearch)) &&
        (!method || payment.payment_method === method) &&
        (!fromDate || paymentDate >= fromDate) &&
        (!toDate || paymentDate <= toDate)
      );
    });
  }, [fromDate, locale, method, payments, search, toDate]);

  const stats = useMemo(() => {
    const totalAmount = filteredPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const invoiceIds = new Set(filteredPayments.map((payment) => payment.invoice_id));
    const latestPayment = filteredPayments[0];

    return {
      totalAmount,
      paymentCount: filteredPayments.length,
      invoiceCount: invoiceIds.size,
      latestPaymentDate: latestPayment?.payment_date,
    };
  }, [filteredPayments]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const paginatedPayments = filteredPayments.slice((page - 1) * pageSize, page * pageSize);

  async function exportExcel() {
    const { default: ExcelJS } = await import('exceljs');
    const rows: Array<Record<string, string | number>> = filteredPayments.map((payment) => ({
      [t('invoice')]: getInvoiceNumber(payment),
      [t('unit')]: getUnitNumber(payment),
      [t('location')]: getLocationName(payment, locale),
      [t('amount')]: Number(payment.amount),
      [t('paymentDate')]: payment.payment_date,
      [t('paymentMethod')]: tc(`paymentMethod.${payment.payment_method}`),
      [t('referenceNumber')]: payment.reference_number ?? '',
      [t('notes')]: payment.notes ?? '',
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payments');
    const headers = Object.keys(rows[0] ?? {});

    worksheet.addRow(headers);
    rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header])));
    headers.forEach((header, index) => {
      worksheet.getColumn(index + 1).width = Math.max(14, header.length + 4);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `payments-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    setSearch('');
    setMethod('');
    setFromDate('');
    setToDate('');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm text-muted-foreground">{t('totalCollected')}</CardTitle>
            <Receipt className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-bold">{formatCurrency(stats.totalAmount, loc)}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm text-muted-foreground">{t('paymentCount')}</CardTitle>
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <p className="mt-3 text-2xl font-bold">{stats.paymentCount}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm text-muted-foreground">{t('invoiceCount')}</CardTitle>
            <Landmark className="h-5 w-5 text-violet-600" />
          </div>
          <p className="mt-3 text-2xl font-bold">{stats.invoiceCount}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm text-muted-foreground">{t('latestPayment')}</CardTitle>
            <CalendarDays className="h-5 w-5 text-orange-600" />
          </div>
          <p className="mt-3 text-2xl font-bold">
            {stats.latestPaymentDate ? formatDate(stats.latestPaymentDate, loc) : '-'}
          </p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(150px,1fr))_auto] lg:items-end">
          <div>
            <label className="text-sm font-medium">{t('search')}</label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t('searchPlaceholder')}
                className="h-10 w-full rounded-xl border border-border bg-background px-9 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('paymentMethod')}</label>
            <select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                setPage(1);
              }}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">{t('allMethods')}</option>
              {paymentMethods.map((paymentMethod) => (
                <option key={paymentMethod} value={paymentMethod}>
                  {tc(`paymentMethod.${paymentMethod}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">{t('fromDate')}</label>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">{t('toDate')}</label>
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button type="button" variant="outline" onClick={resetFilters}>
              {t('resetFilters')}
            </Button>
            <Button type="button" onClick={exportExcel} disabled={filteredPayments.length === 0}>
              <Download className="h-4 w-4" />
              {t('exportExcel')}
            </Button>
          </div>
        </div>
      </Card>

      {filteredPayments.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{payments.length === 0 ? t('empty') : t('noResults')}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {paginatedPayments.map((payment) => (
              <Card key={payment.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{getInvoiceNumber(payment)}</p>
                    <p className="text-sm text-muted-foreground">
                      {getUnitNumber(payment) || '-'} · {getLocationName(payment, locale) || '-'}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-emerald-600">
                    {formatCurrency(Number(payment.amount), loc)}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('paymentDate')}</p>
                    <p>{formatDate(payment.payment_date, loc)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('paymentMethod')}</p>
                    <p>{tc(`paymentMethod.${payment.payment_method}`)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('referenceNumber')}</p>
                    <p>{payment.reference_number ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('notes')}</p>
                    <p className="truncate">{payment.notes ?? '-'}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-start">{t('invoice')}</th>
                  <th className="px-4 py-3 text-start">{t('unit')}</th>
                  <th className="px-4 py-3 text-start">{t('location')}</th>
                  <th className="px-4 py-3 text-start">{t('amount')}</th>
                  <th className="px-4 py-3 text-start">{t('paymentDate')}</th>
                  <th className="px-4 py-3 text-start">{t('paymentMethod')}</th>
                  <th className="px-4 py-3 text-start">{t('referenceNumber')}</th>
                  <th className="px-4 py-3 text-start">{t('notes')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{getInvoiceNumber(payment)}</td>
                    <td className="px-4 py-3">{getUnitNumber(payment) || '-'}</td>
                    <td className="px-4 py-3">{getLocationName(payment, locale) || '-'}</td>
                    <td className="px-4 py-3 font-medium text-emerald-600">
                      {formatCurrency(Number(payment.amount), loc)}
                    </td>
                    <td className="px-4 py-3">{formatDate(payment.payment_date, loc)}</td>
                    <td className="px-4 py-3">{tc(`paymentMethod.${payment.payment_method}`)}</td>
                    <td className="px-4 py-3">{payment.reference_number ?? '-'}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-muted-foreground">
                      {payment.notes ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t('pageSummary', {
                from: (page - 1) * pageSize + 1,
                to: Math.min(page * pageSize, filteredPayments.length),
                total: filteredPayments.length,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {tc('previous')}
              </Button>
              <span className="text-sm font-medium">{page} / {totalPages}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {tc('next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
