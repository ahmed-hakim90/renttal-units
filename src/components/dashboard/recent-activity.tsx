'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonStyles } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Link } from '@/lib/i18n/navigation';
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
import { CreditCard, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice, PaymentMethod } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

function getDaysUntilDue(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

const ACTIVITY_LIMIT = 3;

export function RecentActivity({
  overdueInvoices,
  dueInvoices,
  partialInvoices,
  locale,
  canEdit,
  showPaymentStatusPages = true,
}: {
  overdueInvoices: Invoice[];
  dueInvoices: Invoice[];
  partialInvoices: Invoice[];
  locale: string;
  canEdit: boolean;
  showPaymentStatusPages?: boolean;
}) {
  const t = useTranslations('dashboard');
  const ti = useTranslations('invoices');
  const tp = useTranslations('payments');
  const tc = useTranslations('common.status');
  const tCommon = useTranslations('common');
  const loc = locale as Locale;
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const { isSubmitting, runOnce } = useSingleSubmit();

  function getIssueErrorMessage(error: string) {
    if (error === 'unitNotLinkedToOdoo') return ti('unitNotLinkedToOdoo');
    if (error === 'odooSyncFailed') return ti('odooSyncFailed');
    if (error === 'odooInvoiceNeedsReview') return ti('odooInvoiceNeedsReview');
    if (error === 'invoiceNumberRequired') return ti('invoiceNumberRequired');
    if (error === 'duplicateNumber') return ti('duplicateNumber');
    if (error === 'invalidInvoiceStatus') return ti('invalidInvoiceStatus');
    return tCommon('error');
  }

  function getPaymentErrorMessage(error: string) {
    if (error === 'exceedsBalance') return tp('exceedsBalance');
    if (error === 'cannotPayFullyPaid') return tp('cannotPayFullyPaid');
    return tCommon('error');
  }

  async function handleIssue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice) return;
    await runOnce(async () => {
    const fd = new FormData(e.currentTarget);
    const result = await issueDueInvoice(locale, selectedInvoice.id, fd.get('invoice_number') as string);

    if (result.success) {
      toast.success(ti('invoiceIssued'));
      setIssueOpen(false);
      setSelectedInvoice(null);
    } else {
      const error = 'error' in result ? String(result.error) : '';
      toast.error(getIssueErrorMessage(error));
    }
    });
  }

  async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice) return;
    await runOnce(async () => {
    const fd = new FormData(e.currentTarget);
    const remaining = Number(selectedInvoice.amount) - Number(selectedInvoice.paid_amount);
    const amount = paymentMode === 'full' ? remaining : Number(fd.get('amount'));

    const result = await recordPayment(locale, {
      invoice_id: selectedInvoice.id,
      amount,
      payment_date: fd.get('payment_date') as string,
      payment_method: fd.get('payment_method') as PaymentMethod,
      reference_number: (fd.get('reference_number') as string) || undefined,
    });

    if (result.success) {
      toast.success(tCommon('success'));
      setPayOpen(false);
      setSelectedInvoice(null);
    } else {
      toast.error(getPaymentErrorMessage('error' in result ? String(result.error) : ''));
    }
    });
  }

  const sections = [
    { key: 'overdue' as const, invoices: overdueInvoices, action: 'pay' as const, href: '/invoices' as const },
    { key: 'dueThisMonth' as const, invoices: dueInvoices, action: 'issue' as const, href: '/due-this-month' as const },
    ...(showPaymentStatusPages
      ? [{ key: 'partialPayments' as const, invoices: partialInvoices, action: 'pay' as const, href: '/partial-payments' as const }]
      : []),
  ];

  return (
    <>
      <section className="mt-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold tracking-tight">{t('actionableActivity')}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/invoices" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
              {t('viewAwaiting')}
            </Link>
            {showPaymentStatusPages && (
              <Link href="/fully-paid" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                {t('viewFullyPaid')}
              </Link>
            )}
          </div>
        </div>

        <div className={cn('grid gap-3', sections.length >= 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2')}>
          {sections.map((section) => (
            <Card key={section.key} className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{t(section.key)}</CardTitle>
                <Link href={section.href} className="text-xs font-medium text-primary hover:underline">
                  {t('viewAll')}
                </Link>
              </div>
              <div className="space-y-2">
                {section.invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  section.invoices.slice(0, ACTIVITY_LIMIT).map((inv) => {
                    const daysOverdue = getInvoiceDaysOverdue(inv.due_date);
                    const daysUntilDue = getDaysUntilDue(inv.due_date);
                    const isOldDue = isOldOutstandingDue(inv.due_date, inv.status);

                    return (
                    <div key={inv.id} className={cn('rounded-lg border border-border p-2.5', getInvoiceRowHighlight(inv.due_date, inv.status))}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{inv.unit?.unit_number ?? inv.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(inv.due_date, loc)}</p>
                          {isOldDue && (
                            <p className="mt-1 text-xs font-medium text-amber-800">{ti('oldOutstanding')}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge status={getInvoiceDisplayStatus(inv)} label={tc(getInvoiceDisplayStatus(inv))} />
                          {daysOverdue > 0 && (
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', getOverdueBadgeClass(daysOverdue))}>
                              {ti('daysOverdueLabel', { days: formatNumber(daysOverdue, loc) })}
                            </span>
                          )}
                          {inv.status === 'due' && daysUntilDue >= 0 && daysUntilDue <= 3 && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
                              {daysUntilDue === 0 ? ti('dueToday') : ti('dueSoonLabel', { days: formatNumber(daysUntilDue, loc) })}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-medium">{formatCurrency(Number(inv.amount) - Number(inv.paid_amount), loc)}</p>
                      {canEdit && section.action === 'issue' && inv.status === 'due' && (
                        <Button
                          className="mt-2 w-full"
                          size="sm"
                          variant="issue"
                          onClick={() => { setSelectedInvoice(inv); setIssueOpen(true); }}
                        >
                          <FileText />
                          {ti('issueInvoice')}
                        </Button>
                      )}
                      {canEdit && section.action === 'pay' && (
                        <Button
                          className="mt-2 w-full"
                          size="sm"
                          variant="payment"
                          onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}
                        >
                          <CreditCard />
                          {ti('recordPayment')}
                        </Button>
                      )}
                    </div>
                    );
                  })
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Modal open={issueOpen} onClose={() => !isSubmitting && setIssueOpen(false)} title={ti('issueInvoice')}>
        <form onSubmit={handleIssue} className="space-y-4">
          <Input name="invoice_number" label={ti('invoiceNumber')} required />
          <div className="form-actions">
            <Button variant="outline" type="button" disabled={isSubmitting} onClick={() => setIssueOpen(false)}>{tCommon('cancel')}</Button>
            <Button variant="issue" type="submit" disabled={isSubmitting}>{isSubmitting ? tCommon('loading') : ti('issueInvoice')}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={payOpen} onClose={() => !isSubmitting && setPayOpen(false)} title={tp('create')}>
        {selectedInvoice && (
          <form onSubmit={handlePayment} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {tp('remainingBalance')}: {formatCurrency(Number(selectedInvoice.amount) - Number(selectedInvoice.paid_amount), loc)}
            </p>
            <div>
              <label className="text-sm font-medium">{tp('paymentType')}</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Button type="button" variant={paymentMode === 'full' ? 'payment' : 'outline'} onClick={() => setPaymentMode('full')}>
                  {tp('fullPayment')}
                </Button>
                <Button type="button" variant={paymentMode === 'partial' ? 'payment' : 'outline'} onClick={() => setPaymentMode('partial')}>
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
              <Button variant="outline" type="button" disabled={isSubmitting} onClick={() => setPayOpen(false)}>{tCommon('cancel')}</Button>
              <Button variant="payment" type="submit" disabled={isSubmitting}>{isSubmitting ? tCommon('loading') : tp('create')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
