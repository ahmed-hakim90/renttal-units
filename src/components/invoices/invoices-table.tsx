'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { useListSearchValue } from '@/components/ui/list-search';
import { issueDueInvoice, recordPayment } from '@/lib/actions/invoices';
import { retryOdooInvoiceSync } from '@/lib/actions/odoo';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/format';
import {
  getInvoiceDaysOverdue,
  getInvoiceDisplayStatus,
  getInvoiceRowHighlight,
  getOverdueBadgeClass,
  isOldOutstandingDue,
} from '@/lib/rental/invoice-display';
import { buildOdooInvoiceUrl } from '@/lib/odoo/links';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CreditCard, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import type { Invoice, PaymentMethod } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

function OverdueTag({ days, label }: { days: number; label: string }) {
  if (days <= 0) return null;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', getOverdueBadgeClass(days))}>
      {label}
    </span>
  );
}

function OdooInvoiceReference({
  invoice,
  baseUrl,
  openLabel,
}: {
  invoice: Invoice;
  baseUrl: string;
  openLabel: string;
}) {
  const label = invoice.odoo_invoice_name ?? invoice.odoo_invoice_id?.toString() ?? '—';
  const url = buildOdooInvoiceUrl(baseUrl, invoice.odoo_invoice_id);
  if (!url) return <span>{label}</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
      aria-label={`${openLabel}: ${label}`}
      title={openLabel}
    >
      <span>{label}</span>
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function getDaysUntilDue(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function InvoicesTable({
  invoices, locale, canEdit, odooBaseUrl, showOdooActions = true,
}: {
  invoices: Invoice[];
  locale: string;
  canEdit: boolean;
  odooBaseUrl: string;
  showOdooActions?: boolean;
}) {
  const t = useTranslations('invoices');
  const tp = useTranslations('payments');
  const tc = useTranslations('common.status');
  const tCommon = useTranslations('common');
  const loc = locale as Locale;
  const search = useListSearchValue().trim().toLowerCase();
  const [issueInvoiceOpen, setIssueInvoiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const { isSubmitting: isSaving, runOnce } = useSingleSubmit();

  const visibleInvoices = useMemo(() => {
    if (!search) return invoices;
    return invoices.filter((inv) => [
      inv.invoice_number,
      inv.unit?.unit_number,
      inv.unit?.location?.name_en,
      inv.unit?.location?.name_ar,
      inv.tenant?.full_name,
    ].join(' ').toLowerCase().includes(search));
  }, [invoices, search]);

  function getIssueErrorMessage(error: string) {
    if (error === 'unitNotLinkedToOdoo') return t('unitNotLinkedToOdoo');
    if (error === 'odooSyncFailed') return t('odooSyncFailed');
    if (error === 'odooInvoiceNeedsReview') return t('odooInvoiceNeedsReview');
    if (error === 'invoiceNumberRequired') return t('invoiceNumberRequired');
    if (error === 'duplicateNumber') return t('duplicateNumber');
    if (error === 'invalidInvoiceStatus') return t('invalidInvoiceStatus');
    return tCommon('error');
  }

  function getPaymentErrorMessage(error: string) {
    if (error === 'exceedsBalance') return tp('exceedsBalance');
    if (error === 'cannotPayFullyPaid') return tp('cannotPayFullyPaid');
    return tCommon('error');
  }

  async function handleIssueDueInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice || isSaving) return;
    await runOnce(async () => {
    const fd = new FormData(e.currentTarget);
      const result = await issueDueInvoice(locale, selectedInvoice.id, fd.get('invoice_number') as string);
      if (result.success) {
        toast.success(t('invoiceIssued'));
        setIssueInvoiceOpen(false);
        setSelectedInvoice(null);
      } else {
        const error = 'error' in result ? String(result.error) : '';
        toast.error(getIssueErrorMessage(error));
      }
    });
  }

  async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice || isSaving) return;
    await runOnce(async () => {
    const fd = new FormData(e.currentTarget);
    const remainingAmount = Number(selectedInvoice.amount) - Number(selectedInvoice.paid_amount);
    const amount = paymentMode === 'full' ? remainingAmount : Number(fd.get('amount'));
      const result = await recordPayment(locale, {
        invoice_id: selectedInvoice.id,
        amount,
        payment_date: fd.get('payment_date') as string,
        payment_method: fd.get('payment_method') as PaymentMethod,
        reference_number: (fd.get('reference_number') as string) || undefined,
      });
      if (result.success) {
        toast.success(tp('paymentRecorded'));
        setPayOpen(false);
      } else {
        toast.error(getPaymentErrorMessage('error' in result ? String(result.error) : ''));
      }
    });
  }

  function renderStatus(inv: Invoice) {
    const daysOverdue = getInvoiceDaysOverdue(inv.due_date);
    const daysUntilDue = getDaysUntilDue(inv.due_date);
    const displayStatus = getInvoiceDisplayStatus(inv);

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge status={displayStatus} label={tc(displayStatus)} />
        {inv.status === 'due' && daysUntilDue >= 0 && daysUntilDue <= 3 && (
          <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            {daysUntilDue === 0 ? t('dueToday') : t('dueSoonLabel', { days: formatNumber(daysUntilDue, loc) })}
          </span>
        )}
        {daysOverdue > 0 && (
          <OverdueTag
            days={daysOverdue}
            label={t('daysOverdueLabel', { days: formatNumber(daysOverdue, loc) })}
          />
        )}
      </div>
    );
  }

  async function handleRetryOdoo(invoice: Invoice) {
    const result = await retryOdooInvoiceSync(locale, invoice.id);
    if (result.success) toast.success(t('odooRetryQueued'));
    else toast.error(t('odooRetryFailed'));
  }

  return (
    <>
      {visibleInvoices.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">{t('empty')}</div>
      ) : (
        <>
        <div className="grid gap-3 md:hidden">
          {visibleInvoices.map((inv) => {
            const rowClass = getInvoiceRowHighlight(inv.due_date, inv.status);
            const isOldDue = isOldOutstandingDue(inv.due_date, inv.status);

            return (
            <div key={inv.id} className={cn('mobile-card', rowClass)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{inv.invoice_number}</p>
                  <p className="text-sm text-muted-foreground">{inv.unit?.unit_number ?? '—'}</p>
                  {isOldDue && (
                    <p className="mt-1 text-xs font-medium text-amber-800">{t('oldOutstanding')}</p>
                  )}
                </div>
                {renderStatus(inv)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t('amount')}</p>
                  <p>{formatCurrency(Number(inv.amount), loc)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('paidAmount')}</p>
                  <p>{formatCurrency(Number(inv.paid_amount), loc)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('dueDate')}</p>
                  <p>{formatDate(inv.due_date, loc)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('period')}</p>
                  <p>{formatDate(inv.period_start, loc)} - {formatDate(inv.period_end, loc)}</p>
                </div>
                {showOdooActions && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t('odooInvoice')}</p>
                    <p>
                      <OdooInvoiceReference invoice={inv} baseUrl={odooBaseUrl} openLabel={t('openInOdoo')} />
                    </p>
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="mt-4 flex flex-col gap-2">
                  {inv.status === 'due' && (
                    <Button className="w-full" variant="issue" size="sm" onClick={() => { setSelectedInvoice(inv); setIssueInvoiceOpen(true); }}>
                      <FileText />
                      {t('issueInvoice')}
                    </Button>
                  )}
                  {(inv.status === 'invoice_issued' || inv.status === 'partially_paid' || inv.status === 'overdue') && (
                    <Button className="w-full" variant="payment" size="sm" onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}>
                      <CreditCard />
                      {t('recordPayment')}
                    </Button>
                  )}
                  {showOdooActions && (inv.odoo_sync_status === 'failed' || (inv.odoo_invoice_id && inv.odoo_invoice_state === 'draft')) && (
                    <Button className="w-full" variant="outline" size="sm" onClick={() => handleRetryOdoo(inv)}>
                      <RefreshCw />
                      {t('syncOdoo')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>{t('invoiceNumber')}</th>
                <th>{t('unit')}</th>
                <th>{t('period')}</th>
                <th>{t('amount')}</th>
                <th>{t('paidAmount')}</th>
                <th>{t('dueDate')}</th>
                {showOdooActions && <th>{t('odooInvoice')}</th>}
                <th>{t('statusTransition')}</th>
                {canEdit && (
                  <th className="sticky end-0 z-10 w-px border-s border-border bg-muted !text-end">
                    {t('action')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((inv) => (
                <tr key={inv.id} className={getInvoiceRowHighlight(inv.due_date, inv.status)}>
                  <td className="font-medium">
                    <div>{inv.invoice_number}</div>
                    {isOldOutstandingDue(inv.due_date, inv.status) && (
                      <p className="mt-0.5 text-xs font-medium text-amber-800">{t('oldOutstanding')}</p>
                    )}
                  </td>
                  <td>{inv.unit?.unit_number ?? '—'}</td>
                  <td className="text-xs">{formatDate(inv.period_start, loc)} – {formatDate(inv.period_end, loc)}</td>
                  <td>{formatCurrency(Number(inv.amount), loc)}</td>
                  <td>{formatCurrency(Number(inv.paid_amount), loc)}</td>
                  <td>{formatDate(inv.due_date, loc)}</td>
                  {showOdooActions && (
                    <td>
                      <div className="space-y-1">
                        <div>
                          <OdooInvoiceReference invoice={inv} baseUrl={odooBaseUrl} openLabel={t('openInOdoo')} />
                        </div>
                        <Badge
                          status={inv.odoo_sync_status === 'failed' ? 'failed' : inv.odoo_sync_status === 'synced' ? 'synced' : 'pending'}
                          label={inv.odoo_invoice_state ?? inv.odoo_sync_status ?? '—'}
                        />
                        {inv.odoo_sync_error && <p className="max-w-56 text-xs text-destructive">{inv.odoo_sync_error}</p>}
                      </div>
                    </td>
                  )}
                  <td>{renderStatus(inv)}</td>
                  {canEdit && (
                    <td className="sticky end-0 z-10 w-px whitespace-nowrap border-s border-border bg-card text-end">
                      <div className="row-actions">
                        {inv.status === 'due' && (
                          <Button variant="issue" size="sm" onClick={() => { setSelectedInvoice(inv); setIssueInvoiceOpen(true); }}>
                            <FileText />
                            {t('issueInvoice')}
                          </Button>
                        )}
                        {(inv.status === 'invoice_issued' || inv.status === 'partially_paid' || inv.status === 'overdue') && (
                          <Button variant="payment" size="sm" onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}>
                            <CreditCard />
                            {t('recordPayment')}
                          </Button>
                        )}
                        {showOdooActions && (inv.odoo_sync_status === 'failed' || (inv.odoo_invoice_id && inv.odoo_invoice_state === 'draft')) && (
                          <Button variant="outline" size="sm" onClick={() => handleRetryOdoo(inv)} title={t('syncOdoo')} aria-label={t('syncOdoo')}>
                            <RefreshCw />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Modal open={issueInvoiceOpen} onClose={() => setIssueInvoiceOpen(false)} title={t('issueInvoice')}>
        <form onSubmit={handleIssueDueInvoice} className="space-y-4">
          <Input name="invoice_number" label={t('invoiceNumber')} required />
          <div className="form-actions">
            <Button variant="outline" type="button" disabled={isSaving} onClick={() => setIssueInvoiceOpen(false)}>{tCommon('cancel')}</Button>
            <Button variant="issue" type="submit" disabled={isSaving}>{isSaving ? tCommon('loading') : t('issueInvoice')}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={tp('create')}>
        {selectedInvoice && (
          <form onSubmit={handlePayment} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {tp('remainingBalance')}: {formatCurrency(Number(selectedInvoice.amount) - Number(selectedInvoice.paid_amount), loc)}
            </p>
            <div>
              <label className="text-sm font-medium">{tp('paymentType')}</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={paymentMode === 'full' ? 'payment' : 'outline'}
                  onClick={() => setPaymentMode('full')}
                >
                  {tp('fullPayment')}
                </Button>
                <Button
                  type="button"
                  variant={paymentMode === 'partial' ? 'payment' : 'outline'}
                  onClick={() => setPaymentMode('partial')}
                >
                  {tp('partialPayment')}
                </Button>
              </div>
            </div>
            {paymentMode === 'partial' && (
              <Input name="amount" label={tp('amount')} type="number" step="0.01" required />
            )}
            <Input name="payment_date" label={tp('paymentDate')} type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
            <div>
              <label className="text-sm font-medium">{tp('paymentMethod')}</label>
              <select name="payment_method" className="field-control">
                {(['cash', 'bank_transfer', 'check', 'other'] as const).map((m) => (
                  <option key={m} value={m}>{tCommon(`paymentMethod.${m}`)}</option>
                ))}
              </select>
            </div>
            <Input name="reference_number" label={tp('referenceNumber')} />
            <div className="form-actions">
              <Button variant="outline" type="button" disabled={isSaving} onClick={() => setPayOpen(false)}>{tCommon('cancel')}</Button>
              <Button variant="payment" type="submit" disabled={isSaving}>{isSaving ? tCommon('loading') : tp('create')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
