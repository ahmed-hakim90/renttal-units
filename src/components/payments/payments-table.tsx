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

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const rows = filteredPayments.map((payment) => ({
      [t('invoice')]: getInvoiceNumber(payment),
      [t('unit')]: getUnitNumber(payment),
      [t('location')]: getLocationName(payment, locale),
      [t('amount')]: Number(payment.amount),
      [t('paymentDate')]: payment.payment_date,
      [t('paymentMethod')]: tc(`paymentMethod.${payment.payment_method}`),
      [t('referenceNumber')]: payment.reference_number ?? '',
      [t('notes')]: payment.notes ?? '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments');
    XLSX.writeFile(workbook, `payments-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function resetFilters() {
    setSearch('');
    setMethod('');
    setFromDate('');
    setToDate('');
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-10 w-full rounded-xl border border-border bg-background px-9 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('paymentMethod')}</label>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
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
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">{t('toDate')}</label>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
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
        <div className="overflow-x-auto rounded-2xl border border-border">
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
              {filteredPayments.map((payment) => (
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
      )}
    </div>
  );
}
