'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { issueDueInvoice, recordPayment } from '@/lib/actions/invoices';
import { formatCurrency, formatDate } from '@/lib/i18n/hooks';
import { toast } from 'sonner';
import { CreditCard, FileText } from 'lucide-react';
import type { Invoice, InvoiceStatus, PaymentMethod } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

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
  const [issueInvoiceOpen, setIssueInvoiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');

  async function handleIssueDueInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice) return;
    const fd = new FormData(e.currentTarget);
    const result = await issueDueInvoice(locale, selectedInvoice.id, fd.get('invoice_number') as string);
    if (result.success) {
      toast.success(t('invoiceIssued'));
      setIssueInvoiceOpen(false);
      setSelectedInvoice(null);
    } else {
      toast.error('error' in result ? String(result.error) : tCommon('error'));
    }
  }

  async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice) return;
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
    if (result.success) { toast.success('OK'); setPayOpen(false); }
    else toast.error('error' in result ? String(result.error) : tp('exceedsBalance'));
  }

  return (
    <>
      {invoices.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="rounded-2xl border border-border overflow-x-auto">
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
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.unit?.unit_number ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{formatDate(inv.period_start, loc)} – {formatDate(inv.period_end, loc)}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(inv.amount), loc)}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(inv.paid_amount), loc)}</td>
                  <td className="px-4 py-3">{formatDate(inv.due_date, loc)}</td>
                  <td className="px-4 py-3"><Badge status={inv.status} label={tc(inv.status as InvoiceStatus)} /></td>
                  {canEdit && (
                    <td className="px-4 py-3 text-end">
                      {inv.status === 'due' && (
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedInvoice(inv); setIssueInvoiceOpen(true); }}>
                          <FileText className="h-4 w-4" />
                          {t('issueInvoice')}
                        </Button>
                      )}
                      {(inv.status === 'invoice_issued' || inv.status === 'partially_paid') && (
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}>
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
      )}

      <Modal open={issueInvoiceOpen} onClose={() => setIssueInvoiceOpen(false)} title={t('issueInvoice')}>
        <form onSubmit={handleIssueDueInvoice} className="space-y-4">
          <Input name="invoice_number" label={t('invoiceNumber')} required />
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setIssueInvoiceOpen(false)}>{tCommon('cancel')}</Button>
            <Button type="submit">{t('issueInvoice')}</Button>
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
                  variant={paymentMode === 'full' ? 'primary' : 'outline'}
                  onClick={() => setPaymentMode('full')}
                >
                  {tp('fullPayment')}
                </Button>
                <Button
                  type="button"
                  variant={paymentMode === 'partial' ? 'primary' : 'outline'}
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
              <Button variant="outline" type="button" onClick={() => setPayOpen(false)}>{tCommon('cancel')}</Button>
              <Button type="submit">{tp('create')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
