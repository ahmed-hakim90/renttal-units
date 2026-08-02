'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatDate } from '@/lib/i18n/format';
import { Link } from '@/lib/i18n/navigation';
import type { Locale } from '@/lib/i18n/routing';
import type { OdooInvoiceDocument, OdooInvoiceLine } from '@/types/database';

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

function lineNeedsReview(line: OdooInvoiceLine) {
  return line.mapping_status === 'needs_review' || line.mapping_status === 'unmatched';
}

function documentNeedsReview(document: OdooInvoiceDocument) {
  return (document.lines ?? []).some(lineNeedsReview);
}

function unitLabelsFor(document: OdooInvoiceDocument, locale: string) {
  return Array.from(new Set((document.lines ?? [])
    .map((line) => line.unit
      ? `${getUnitLocationName(line.unit.location, locale)} ${line.unit.unit_number}`.trim()
      : null)
    .filter((value): value is string => Boolean(value))));
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
  const [selected, setSelected] = useState<OdooInvoiceDocument | null>(null);

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

  const selectedNeedsReview = useMemo(
    () => (selected ? documentNeedsReview(selected) : false),
    [selected],
  );

  if (documents.length === 0) {
    return <div className="px-5 py-10 text-center text-sm text-muted-foreground">{t('noOdooDocuments')}</div>;
  }

  function renderLineMeta(line: OdooInvoiceLine) {
    return (
      <p className="mt-1 text-xs text-muted-foreground" dir="auto">
        {line.unit
          ? `${getUnitLocationName(line.unit.location, locale)} · ${line.unit.unit_number}`
          : t('serviceOrUnmappedLine')}
        {line.period_start && line.period_end ? ` · ${line.period_start} - ${line.period_end}` : ''}
        {lineNeedsReview(line) ? ` · ${t('odooInvoiceNeedsReview')}` : ''}
        {line.review_reason ? ` · ${line.review_reason}` : ''}
      </p>
    );
  }

  function renderActions(document: OdooInvoiceDocument, fullWidth: boolean) {
    const needsReview = documentNeedsReview(document);
    return (
      <div className={fullWidth ? 'mt-4 flex flex-col gap-2' : 'row-actions justify-end'}>
        <Button
          className={fullWidth ? 'w-full' : undefined}
          variant="outline"
          size={fullWidth ? 'sm' : 'icon-sm'}
          onClick={() => setSelected(document)}
          title={t('viewDetails')}
          aria-label={t('viewDetails')}
        >
          <Eye className="size-4" aria-hidden="true" />
          {fullWidth ? t('viewDetails') : null}
        </Button>
        {needsReview && (
          <Link
            href="/import#odoo-import-center"
            className={
              fullWidth
                ? 'inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium'
                : 'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground'
            }
            title={t('resolveInImportCenter')}
            aria-label={t('resolveInImportCenter')}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {fullWidth ? t('resolveInImportCenter') : null}
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 p-3 md:hidden">
        {documents.map((document) => {
          const unitLabels = unitLabelsFor(document, locale);
          const needsReview = documentNeedsReview(document);
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
                  {needsReview && (
                    <Badge status="pending" label={t('odooInvoiceNeedsReview')} />
                  )}
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

              {renderActions(document, true)}
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
              <th className="px-4 py-3 text-end font-medium">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
              const unitLabels = unitLabelsFor(document, locale);
              const needsReview = documentNeedsReview(document);
              return (
                <tr key={document.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-semibold text-primary">{document.invoice_name}</td>
                  <td className="px-4 py-3">{document.tenant?.full_name ?? `Odoo #${document.partner_odoo_id ?? '—'}`}</td>
                  <td className="px-4 py-3">{unitLabels.join(', ') || '—'}</td>
                  <td className="px-4 py-3">{document.invoice_date ? formatDate(document.invoice_date, loc) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge status={document.move_state === 'posted' ? 'linked' : 'pending'} label={getOdooStatusLabel(document.move_state)} />
                      <Badge status={paymentBadgeStatus(document.payment_state)} label={getOdooStatusLabel(document.payment_state)} />
                      {needsReview && (
                        <Badge status="pending" label={t('odooInvoiceNeedsReview')} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(document.amount_total), loc)}</td>
                  <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(document.amount_paid), loc)}</td>
                  <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(Number(document.amount_residual), loc)}</td>
                  <td className="px-4 py-3 text-end">{renderActions(document, false)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.invoice_name ?? t('viewDetails')}
      >
        {selected && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenant')}</dt>
                <dd className="mt-0.5" dir="auto">
                  {selected.tenant?.full_name ?? `Odoo #${selected.partner_odoo_id ?? '—'}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('issuedAt')}</dt>
                <dd className="mt-0.5">
                  {selected.invoice_date ? formatDate(selected.invoice_date, loc) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('amount')}</dt>
                <dd className="mt-0.5 tabular-nums">{formatCurrency(Number(selected.amount_total), loc)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('remaining')}</dt>
                <dd className="mt-0.5 tabular-nums">{formatCurrency(Number(selected.amount_residual), loc)}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-1.5">
              <Badge status={selected.move_state === 'posted' ? 'linked' : 'pending'} label={getOdooStatusLabel(selected.move_state)} />
              <Badge status={paymentBadgeStatus(selected.payment_state)} label={getOdooStatusLabel(selected.payment_state)} />
              {selectedNeedsReview && (
                <Badge status="pending" label={t('odooInvoiceNeedsReview')} />
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold">{t('documentLines')}</h3>
              <div className="mt-2 space-y-3">
                {(selected.lines ?? []).map((line) => (
                  <div key={line.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words text-sm font-medium" dir="auto">
                        {line.description ?? `#${line.odoo_line_id}`}
                      </p>
                      <span className="shrink-0 text-sm tabular-nums">
                        {formatCurrency(Number(line.amount_total), loc)}
                      </span>
                    </div>
                    {renderLineMeta(line)}
                    {line.local_invoice_id && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('linkedLocalInvoice')}: {line.local_invoice_id}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {(selected.payments ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t('odooDocumentPayments')}</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {(selected.payments ?? []).map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <span>
                        {payment.payment_date ? formatDate(payment.payment_date, loc) : '—'}
                      </span>
                      <span className="tabular-nums">{formatCurrency(Number(payment.amount), loc)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedNeedsReview && (
              <Link
                href="/import#odoo-import-center"
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {t('resolveInImportCenter')}
              </Link>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
