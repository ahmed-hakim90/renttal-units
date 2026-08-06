'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { ListSearch, useListSearchValue } from '@/components/ui/list-search';
import { Link } from '@/lib/i18n/navigation';
import { issueDueInvoice, recordPayment } from '@/lib/actions/invoices';
import { checkOdooInvoiceStatus, sendInvoiceToOdoo } from '@/lib/actions/odoo';
import {
  shouldShowOdooInvoiceSendButton,
  shouldShowOdooInvoiceStatusCheckButton,
} from '@/lib/features/guards';
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
import type { OdooInvoiceSendVisibleStatus } from '@/lib/odoo/invoice-send-settings';
import { isOdooInvoiceDeleted } from '@/lib/odoo/invoice-state';
import { isFeatureDisabledResult } from '@/lib/features';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CreditCard, ExternalLink, Eye, FileText, RefreshCw, Send } from 'lucide-react';
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
  if (isOdooInvoiceDeleted(invoice)) return null;

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

function getOdooStateLabel(
  invoice: Invoice,
  t: ReturnType<typeof useTranslations<'invoices'>>,
) {
  if (isOdooInvoiceDeleted(invoice)) return t('odooStatus.deleted');

  const state = invoice.odoo_invoice_state;
  if (state === 'draft') return t('odooStatus.draft');
  if (state === 'posted') return t('odooStatus.posted');
  if (state === 'cancel') return t('odooStatus.cancelled');
  if (state) return state;
  if (invoice.odoo_sync_status === 'failed') return t('odooRetryFailed');
  if (invoice.odoo_sync_status === 'needs_review') return t('odooInvoiceNeedsReview');
  if (invoice.odoo_sync_status === 'synced') return t('odooStatus.posted');
  return '—';
}

function getOdooPaymentStateLabel(
  state: string | null,
  t: ReturnType<typeof useTranslations<'invoices'>>,
) {
  if (state === 'not_paid') return t('odooStatus.notPaid');
  if (state === 'in_payment') return t('odooStatus.inPayment');
  if (state === 'paid') return t('odooStatus.paid');
  if (state === 'partial') return t('odooStatus.partial');
  if (state === 'reversed') return t('odooStatus.reversed');
  return state;
}

function isOdooManagedInvoice(invoice: Invoice) {
  return invoice.odoo_invoice_id != null;
}

export function InvoicesTable({
  invoices,
  locale,
  canEdit,
  canManageOdoo = false,
  odooBaseUrl,
  showOdooActions = true,
  showOdooManualSend = false,
  odooIntegrationEnabled = false,
  invoiceSendVisibleStatus = 'invoice_issued',
}: {
  invoices: Invoice[];
  locale: string;
  canEdit: boolean;
  canManageOdoo?: boolean;
  odooBaseUrl: string;
  showOdooActions?: boolean;
  showOdooManualSend?: boolean;
  odooIntegrationEnabled?: boolean;
  invoiceSendVisibleStatus?: OdooInvoiceSendVisibleStatus;
}) {
  const t = useTranslations('invoices');
  const tp = useTranslations('payments');
  const tc = useTranslations('common.status');
  const tCommon = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const loc = locale as Locale;
  const search = useListSearchValue().trim().toLowerCase();
  const [issueInvoiceOpen, setIssueInvoiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const [odooBusyId, setOdooBusyId] = useState<string | null>(null);
  const { isSubmitting: isSaving, runOnce } = useSingleSubmit();

  const visibleInvoices = useMemo(() => {
    if (!search) return invoices;
    return invoices.filter((inv) => [
      inv.invoice_number,
      inv.unit?.unit_number,
      inv.unit?.location?.name_en,
      inv.unit?.location?.name_ar,
      inv.tenant?.full_name,
    ].some((value) => value?.toLowerCase().includes(search)));
  }, [invoices, search]);

  const showActionsColumn = true;

  function invoiceDetailHref(invoice: Invoice) {
    if (invoice.contract_id) return `/contracts/${invoice.contract_id}`;
    return `/units/${invoice.unit_id}`;
  }

  function canSendToOdoo(invoice: Invoice) {
    return shouldShowOdooInvoiceSendButton({
      odooDocumentsEnabled: showOdooActions,
      manualSendEnabled: showOdooManualSend,
      canManageOdoo,
      odooIntegrationEnabled,
      visibleStatus: invoiceSendVisibleStatus,
      invoice,
    });
  }

  function canCheckOdooStatus(invoice: Invoice) {
    return shouldShowOdooInvoiceStatusCheckButton({
      odooDocumentsEnabled: showOdooActions,
      canManageOdoo,
      invoice,
    });
  }

  function getIssueErrorMessage(error: string) {
    if (error === 'invoiceNumberRequired') return t('invoiceNumberRequired');
    if (error === 'duplicateNumber') return t('duplicateNumber');
    if (error === 'invalidInvoiceStatus') return t('invalidInvoiceStatus');
    return tCommon('error');
  }

  function getOdooActionErrorMessage(error: string) {
    if (error === 'unitNotLinkedToOdoo') return t('unitNotLinkedToOdoo');
    if (error === 'odooVatTaxMissing') return t('odooVatTaxMissing');
    if (error === 'odooZeroRatedTaxMissing') return t('odooZeroRatedTaxMissing');
    if (error === 'serviceProductInvalid') return t('serviceProductInvalid');
    if (error === 'odooSyncFailed') return t('odooSyncFailed');
    if (error === 'odooInvoiceNeedsReview') return t('odooInvoiceNeedsReview');
    if (error === 'invoiceNotReadyForOdoo') return t('invoiceNotReadyForOdoo');
    if (error === 'invoiceBeforeOdooTracking') return t('invoiceBeforeOdooTracking');
    if (error === 'odooSendStageMismatch') return t('odooSendStageMismatch');
    if (error === 'odooDisabled') return t('odooDisabled');
    if (error === 'odooInvoiceNotFound') return t('odooInvoiceNotFound');
    return t('odooSendFailed');
  }

  function getPaymentErrorMessage(error: string) {
    if (error === 'exceedsBalance') return tp('exceedsBalance');
    if (error === 'cannotPayFullyPaid') return tp('cannotPayFullyPaid');
    if (error === 'paymentManagedByOdoo') return tp('paymentManagedByOdoo');
    return tCommon('error');
  }

  async function handleIssueDueInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice || isSaving) return;
    await runOnce(async () => {
      const result = await issueDueInvoice(locale, selectedInvoice.id);
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

  async function handleSendToOdoo(invoice: Invoice) {
    if (odooBusyId) return;
    setOdooBusyId(invoice.id);
    try {
      const result = await sendInvoiceToOdoo(locale, invoice.id);
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      if (result.success) toast.success(t('odooSendQueued'));
      else toast.error(getOdooActionErrorMessage('error' in result ? String(result.error) : ''));
    } finally {
      setOdooBusyId(null);
    }
  }

  async function handleCheckOdooStatus(invoice: Invoice) {
    if (odooBusyId) return;
    setOdooBusyId(invoice.id);
    try {
      const result = await checkOdooInvoiceStatus(locale, invoice.id);
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      if (result.success) toast.success(t('odooStatusChecked'));
      else toast.error(
        'error' in result && result.error === 'odooInvoiceNotFound'
          ? t('odooInvoiceNotFound')
          : t('odooStatusCheckFailed'),
      );
    } finally {
      setOdooBusyId(null);
    }
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

  function renderOdooButtons(inv: Invoice, fullWidth: boolean) {
    if (isOdooManagedInvoice(inv)) return null;
    const busy = odooBusyId === inv.id;
    const showSend = canSendToOdoo(inv);
    const showCheck = canCheckOdooStatus(inv);
    const needsReview = inv.odoo_sync_status === 'needs_review';
    const sendLabel = inv.odoo_sync_status === 'failed' ? t('retryOdoo') : t('sendToOdoo');
    if (!showSend && !showCheck && !needsReview) return null;

    return (
      <>
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
        {showSend && (
          <Button
            className={fullWidth ? 'w-full' : undefined}
            variant="outline"
            size={fullWidth ? 'sm' : 'icon-sm'}
            disabled={Boolean(odooBusyId)}
            onClick={() => handleSendToOdoo(inv)}
            title={sendLabel}
            aria-label={sendLabel}
          >
            {inv.odoo_sync_status === 'failed'
              ? <RefreshCw aria-hidden="true" className={busy ? 'animate-spin' : undefined} />
              : <Send aria-hidden="true" />}
            {fullWidth ? (busy ? tCommon('loading') : sendLabel) : null}
          </Button>
        )}
        {showCheck && (
          <Button
            className={fullWidth ? 'w-full' : undefined}
            variant="outline"
            size={fullWidth ? 'sm' : 'icon-sm'}
            disabled={Boolean(odooBusyId)}
            onClick={() => handleCheckOdooStatus(inv)}
            title={t('syncOdoo')}
            aria-label={t('syncOdoo')}
          >
            <RefreshCw aria-hidden="true" className={busy ? 'animate-spin' : undefined} />
            {fullWidth ? (busy ? tCommon('loading') : t('syncOdoo')) : null}
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="toolbar">
        <ListSearch />
      </div>

      {visibleInvoices.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">
          {search ? tCommon('noResults') : t('empty')}
        </div>
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
                    <div className="mt-1">
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          status={inv.odoo_sync_status === 'failed' ? 'failed' : inv.odoo_sync_status === 'synced' ? 'synced' : 'pending'}
                          label={getOdooStateLabel(inv, t)}
                        />
                        {inv.odoo_payment_state && (
                          <Badge
                            status={inv.odoo_payment_state === 'paid' ? 'success' : 'pending'}
                            label={getOdooPaymentStateLabel(inv.odoo_payment_state, t) ?? '—'}
                          />
                        )}
                      </div>
                      {inv.odoo_amount_total != null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('odooAmounts', {
                            total: formatCurrency(Number(inv.odoo_amount_total), loc),
                            paid: formatCurrency(Number(inv.odoo_amount_paid ?? 0), loc),
                            residual: formatCurrency(Number(inv.odoo_amount_residual ?? 0), loc),
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href={invoiceDetailHref(inv)}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium"
                >
                  <Eye className="size-4" />
                  {t('viewDetails')}
                </Link>
                {canEdit && !isOdooManagedInvoice(inv) && inv.status === 'due' && (
                  <Button className="w-full" variant="issue" size="sm" onClick={() => { setSelectedInvoice(inv); setIssueInvoiceOpen(true); }}>
                    <FileText />
                    {t('issueInvoice')}
                  </Button>
                )}
                {canEdit && !isOdooManagedInvoice(inv) && (inv.status === 'invoice_issued' || inv.status === 'partially_paid' || inv.status === 'overdue') && (
                  <Button className="w-full" variant="payment" size="sm" onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}>
                    <CreditCard />
                    {t('recordPayment')}
                  </Button>
                )}
                {renderOdooButtons(inv, true)}
              </div>
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
                {showActionsColumn && (
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
                    <Link
                      href={invoiceDetailHref(inv)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {inv.invoice_number}
                    </Link>
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
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            status={inv.odoo_sync_status === 'failed' ? 'failed' : inv.odoo_sync_status === 'synced' ? 'synced' : 'pending'}
                            label={getOdooStateLabel(inv, t)}
                          />
                          {inv.odoo_payment_state && (
                            <Badge
                              status={inv.odoo_payment_state === 'paid' ? 'success' : 'pending'}
                              label={getOdooPaymentStateLabel(inv.odoo_payment_state, t) ?? '—'}
                            />
                          )}
                        </div>
                        {inv.odoo_amount_total != null && (
                          <p className="max-w-72 text-xs text-muted-foreground">
                            {t('odooAmounts', {
                              total: formatCurrency(Number(inv.odoo_amount_total), loc),
                              paid: formatCurrency(Number(inv.odoo_amount_paid ?? 0), loc),
                              residual: formatCurrency(Number(inv.odoo_amount_residual ?? 0), loc),
                            })}
                          </p>
                        )}
                        {inv.odoo_sync_error && !isOdooInvoiceDeleted(inv) && (
                          <p className="max-w-56 text-xs text-destructive">{t('odooRetryFailed')}</p>
                        )}
                      </div>
                    </td>
                  )}
                  <td>{renderStatus(inv)}</td>
                  {showActionsColumn && (
                    <td className="sticky end-0 z-10 w-px whitespace-nowrap border-s border-border bg-card text-end">
                      <div className="row-actions">
                        <Link
                          href={invoiceDetailHref(inv)}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={t('viewDetails')}
                          aria-label={t('viewDetails')}
                        >
                          <Eye className="size-4" aria-hidden="true" />
                        </Link>
                        {canEdit && !isOdooManagedInvoice(inv) && inv.status === 'due' && (
                          <Button
                            variant="issue"
                            size="icon-sm"
                            title={t('issueInvoice')}
                            aria-label={t('issueInvoice')}
                            onClick={() => { setSelectedInvoice(inv); setIssueInvoiceOpen(true); }}
                          >
                            <FileText aria-hidden="true" />
                          </Button>
                        )}
                        {canEdit && !isOdooManagedInvoice(inv) && (inv.status === 'invoice_issued' || inv.status === 'partially_paid' || inv.status === 'overdue') && (
                          <Button
                            variant="payment"
                            size="icon-sm"
                            title={t('recordPayment')}
                            aria-label={t('recordPayment')}
                            onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}
                          >
                            <CreditCard aria-hidden="true" />
                          </Button>
                        )}
                        {renderOdooButtons(inv, false)}
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
          {selectedInvoice && (
            <p className="text-sm text-muted-foreground">
              {t('issueGeneratedInvoiceNumber', { number: selectedInvoice.invoice_number })}
            </p>
          )}
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
