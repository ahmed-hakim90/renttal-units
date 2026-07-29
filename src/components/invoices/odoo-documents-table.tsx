'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { OdooInvoiceDocument } from '@/types/database';

function paymentBadgeStatus(state: string | null) {
  if (state === 'paid') return 'success';
  if (state === 'partial' || state === 'in_payment') return 'pending';
  return 'unlinked';
}

function getUnitLocationName(
  location: { name_ar: string; name_en: string } | null | undefined,
  locale: string,
) {
  if (!location) return '';
  return locale === 'ar'
    ? location.name_ar || location.name_en
    : location.name_en || location.name_ar;
}

export function OdooDocumentsTable({
  documents,
  locale,
}: {
  documents: OdooInvoiceDocument[];
  locale: string;
}) {
  const t = useTranslations('invoices');
  const loc = locale as Locale;
  const getOdooStatusLabel = (state: string | null) => {
    const labels: Record<string, string> = {
      draft: t('odooStatus.draft'),
      posted: t('odooStatus.posted'),
      cancel: t('odooStatus.cancelled'),
      not_paid: t('odooStatus.notPaid'),
      in_payment: t('odooStatus.inPayment'),
      paid: t('odooStatus.paid'),
      partial: t('odooStatus.partial'),
      reversed: t('odooStatus.reversed'),
      invoicing_legacy: t('odooStatus.legacy'),
    };
    return state ? labels[state] ?? t('odooStatus.unknown') : t('odooStatus.notPaid');
  };

  if (documents.length === 0) {
    return <div className="px-5 py-10 text-center text-sm text-muted-foreground">{t('noOdooDocuments')}</div>;
  }

  return (
    <>
      <div className="grid gap-3 p-3 md:hidden">
        {documents.map((document) => {
          const unitLabels = Array.from(new Set((document.lines ?? [])
            .map((line) => line.unit
              ? `${getUnitLocationName(line.unit.location, locale)} ${line.unit.unit_number}`.trim()
              : null)
            .filter((value): value is string => Boolean(value))));
          return (
            <article key={document.id} className="mobile-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-primary" dir="auto">{document.invoice_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                    {document.tenant?.full_name ?? `Odoo #${document.partner_odoo_id ?? '—'}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge
                    status={document.move_state === 'posted' ? 'linked' : 'pending'}
                    label={getOdooStatusLabel(document.move_state)}
                  />
                  <Badge
                    status={paymentBadgeStatus(document.payment_state)}
                    label={getOdooStatusLabel(document.payment_state)}
                  />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">{t('unit')}</dt>
                  <dd className="mt-0.5" dir="auto">{unitLabels.join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('issuedAt')}</dt>
                  <dd className="mt-0.5">{document.invoice_date ? formatDate(document.invoice_date, loc) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('amount')}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{formatCurrency(Number(document.amount_total), loc)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('paidAmount')}</dt>
                  <dd className="mt-0.5 tabular-nums">{formatCurrency(Number(document.amount_paid), loc)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('remaining')}</dt>
                  <dd className="mt-0.5 tabular-nums">{formatCurrency(Number(document.amount_residual), loc)}</dd>
                </div>
              </dl>

              <details className="mt-4 border-t border-border pt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">{t('documentLines')}</summary>
                <div className="mt-3 space-y-3">
                  {(document.lines ?? []).map((line) => (
                    <div key={line.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words text-sm font-medium" dir="auto">
                          {line.description ?? `#${line.odoo_line_id}`}
                        </p>
                        <span className="shrink-0 text-sm tabular-nums">{formatCurrency(Number(line.amount_total), loc)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                        {line.unit
                          ? `${getUnitLocationName(line.unit.location, locale)} · ${line.unit.unit_number}`
                          : t('serviceOrUnmappedLine')}
                        {line.period_start && line.period_end ? ` · ${line.period_start} - ${line.period_end}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-start font-medium">{t('invoiceNumber')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('tenant')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('unit')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('issuedAt')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('statusTransition')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('amount')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('paidAmount')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('remaining')}</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => {
            const unitLabels = Array.from(new Set((document.lines ?? [])
              .map((line) => line.unit
                ? `${getUnitLocationName(line.unit.location, locale)} ${line.unit.unit_number}`.trim()
                : null)
              .filter((value): value is string => Boolean(value))));
            return (
              <tr key={document.id} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <details>
                    <summary className="cursor-pointer font-semibold text-primary">
                      {document.invoice_name}
                    </summary>
                    <div className="mt-3 min-w-[34rem] space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      {(document.lines ?? []).map((line) => (
                        <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                          <div>
                            <p className="font-medium">{line.description ?? `#${line.odoo_line_id}`}</p>
                            <p className="text-xs text-muted-foreground">
                              {line.unit ? `${getUnitLocationName(line.unit.location, locale)} · ${line.unit.unit_number}` : t('serviceOrUnmappedLine')}
                              {line.period_start && line.period_end ? ` · ${line.period_start} - ${line.period_end}` : ''}
                            </p>
                          </div>
                          <span className="tabular-nums">{formatCurrency(Number(line.amount_total), loc)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </td>
                <td className="px-4 py-3">{document.tenant?.full_name ?? `Odoo #${document.partner_odoo_id ?? '—'}`}</td>
                <td className="px-4 py-3">{unitLabels.join(', ') || '—'}</td>
                <td className="px-4 py-3">{document.invoice_date ? formatDate(document.invoice_date, loc) : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge status={document.move_state === 'posted' ? 'linked' : 'pending'} label={getOdooStatusLabel(document.move_state)} />
                    <Badge status={paymentBadgeStatus(document.payment_state)} label={getOdooStatusLabel(document.payment_state)} />
                  </div>
                </td>
                <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(document.amount_total), loc)}</td>
                <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(document.amount_paid), loc)}</td>
                <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(document.amount_residual), loc)}</td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </>
  );
}
