'use client';

import { useTranslations } from 'next-intl';
import { formatCurrency, formatDate } from '@/lib/i18n/hooks';
import type { Payment } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

export function PaymentsTable({ payments, locale }: { payments: Payment[]; locale: string }) {
  const t = useTranslations('payments');
  const tc = useTranslations('common');
  const loc = locale as Locale;

  if (payments.length === 0) {
    return <p className="text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <div className="rounded-2xl border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-start">{t('invoice')}</th>
            <th className="px-4 py-3 text-start">{t('amount')}</th>
            <th className="px-4 py-3 text-start">{t('paymentDate')}</th>
            <th className="px-4 py-3 text-start">{t('paymentMethod')}</th>
            <th className="px-4 py-3 text-start">{t('referenceNumber')}</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((pay) => (
            <tr key={pay.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{pay.invoice?.invoice_number ?? pay.invoice_id}</td>
              <td className="px-4 py-3 text-green-600">{formatCurrency(Number(pay.amount), loc)}</td>
              <td className="px-4 py-3">{formatDate(pay.payment_date, loc)}</td>
              <td className="px-4 py-3">{tc(`paymentMethod.${pay.payment_method}`)}</td>
              <td className="px-4 py-3">{pay.reference_number ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
