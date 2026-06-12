'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { issueDueInvoice, recordPayment } from '@/lib/actions/invoices';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/format';
import {
  getInvoiceDaysOverdue,
  getInvoiceDisplayStatus,
  getInvoiceRowHighlight,
  getOverdueBadgeClass,
  isOldOutstandingDue,
} from '@/lib/rental/invoice-display';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CreditCard, FileText } from 'lucide-react';
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

export function InvoicesTable({
  invoices, locale, canEdit,
}: {
  invoices: Invoice[];
  locale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('invoices');
  const tp = useTranslations('payments');
  const tc = useTranslations('common.status');
  const tCommon = useTranslations('common');
  const loc = locale as Locale;
  const searchParams = useSearchParams();
  const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
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
        toast.error('error' in result ? String(result.error) : tCommon('error'));
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
        toast.error('error' in result ? String(result.error) : tp('exceedsBalance'));
      }
    });
  }

  function renderStatus(inv: Invoice) {
    const daysOverdue = getInvoiceDaysOverdue(inv.due_date);
    const displayStatus = getInvoiceDisplayStatus(inv);

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge status={displayStatus} label={tc(displayStatus)} />
        {daysOverdue > 0 && (
          <OverdueTag
            days={daysOverdue}
            label={t('daysOverdueLabel', { days: formatNumber(daysOverdue, loc) })}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {visibleInvoices.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
        <div className="grid gap-3 md:hidden">
          {visibleInvoices.map((inv) => {
            const rowClass = getInvoiceRowHighlight(inv.due_date, inv.status);
            const isOldDue = isOldOutstandingDue(inv.due_date, inv.status);

            return (
            <div key={inv.id} className={cn('rounded-2xl border border-border bg-card p-4', rowClass)}>
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
              </div>
              {canEdit && (
                <div className="mt-4">
                  {inv.status === 'due' && (
                    <Button className="w-full" variant="issue" size="sm" onClick={() => { setSelectedInvoice(inv); setIssueInvoiceOpen(true); }}>
                      <FileText className="h-4 w-4" />
                      {t('issueInvoice')}
                    </Button>
                  )}
                  {(inv.status === 'invoice_issued' || inv.status === 'partially_paid' || inv.status === 'overdue') && (
                    <Button className="w-full" variant="payment" size="sm" onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}>
                      <CreditCard className="h-4 w-4" />
                      {t('recordPayment')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>

        <div className="hidden rounded-2xl border border-border overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start">{t('invoiceNumber')}</th>
                <th className="px-4 py-3 text-start">{t('unit')}</th>
                <th className="px-4 py-3 text-start">{t('period')}</th>
                <th className="px-4 py-3 text-start">{t('amount')}</th>
                <th className="px-4 py-3 text-start">{t('paidAmount')}</th>
                <th className="px-4 py-3 text-start">{t('dueDate')}</th>
                <th className="px-4 py-3 text-start">{t('statusTransition')}</th>
                {canEdit && <th className="px-4 py-3 text-end">{t('action')}</th>}
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((inv) => (
                <tr key={inv.id} className={cn('border-t border-border', getInvoiceRowHighlight(inv.due_date, inv.status))}>
                  <td className="px-4 py-3 font-medium">
                    <div>{inv.invoice_number}</div>
                    {isOldOutstandingDue(inv.due_date, inv.status) && (
                      <p className="mt-0.5 text-xs font-medium text-amber-800">{t('oldOutstanding')}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">{inv.unit?.unit_number ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{formatDate(inv.period_start, loc)} – {formatDate(inv.period_end, loc)}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(inv.amount), loc)}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(inv.paid_amount), loc)}</td>
                  <td className="px-4 py-3">{formatDate(inv.due_date, loc)}</td>
                  <td className="px-4 py-3">{renderStatus(inv)}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-end">
                      {inv.status === 'due' && (
                        <Button variant="issue" size="sm" onClick={() => { setSelectedInvoice(inv); setIssueInvoiceOpen(true); }}>
                          <FileText className="h-4 w-4" />
                          {t('issueInvoice')}
                        </Button>
                      )}
                      {(inv.status === 'invoice_issued' || inv.status === 'partially_paid' || inv.status === 'overdue') && (
                        <Button variant="payment" size="sm" onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}>
                          <CreditCard className="h-4 w-4" />
                          {t('recordPayment')}
                        </Button>
                      )}
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
          <div className="flex justify-end gap-3">
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
              <select name="payment_method" className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm">
                {(['cash', 'bank_transfer', 'check', 'other'] as const).map((m) => (
                  <option key={m} value={m}>{tCommon(`paymentMethod.${m}`)}</option>
                ))}
              </select>
            </div>
            <Input name="reference_number" label={tp('referenceNumber')} />
            <div className="flex justify-end gap-3">
              <Button variant="outline" type="button" disabled={isSaving} onClick={() => setPayOpen(false)}>{tCommon('cancel')}</Button>
              <Button variant="payment" type="submit" disabled={isSaving}>{isSaving ? tCommon('loading') : tp('create')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
