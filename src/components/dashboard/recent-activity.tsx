'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { issueDueInvoice, recordPayment } from '@/lib/actions/invoices';
import { formatCurrency, formatDate } from '@/lib/i18n/hooks';
import { CreditCard, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice, PaymentMethod } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

export function RecentActivity({
  dueInvoices,
  awaitingInvoices,
  partialInvoices,
  fullyPaidInvoices,
  locale,
  canEdit,
}: {
  dueInvoices: Invoice[];
  awaitingInvoices: Invoice[];
  partialInvoices: Invoice[];
  fullyPaidInvoices: Invoice[];
  locale: string;
  canEdit: boolean;
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

  async function handleIssue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice) return;
    const fd = new FormData(e.currentTarget);
    const result = await issueDueInvoice(locale, selectedInvoice.id, fd.get('invoice_number') as string);

    if (result.success) {
      toast.success(ti('invoiceIssued'));
      setIssueOpen(false);
      setSelectedInvoice(null);
    } else {
      toast.error('error' in result ? String(result.error) : tCommon('error'));
    }
  }

  async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedInvoice) return;
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
      toast.error('error' in result ? String(result.error) : tCommon('error'));
    }
  }

  const sections = [
    { key: 'dueThisMonth' as const, invoices: dueInvoices, action: 'issue' as const },
    { key: 'awaitingPayment' as const, invoices: awaitingInvoices, action: 'pay' as const },
    { key: 'partialPayments' as const, invoices: partialInvoices, action: 'pay' as const },
    { key: 'fullyPaid' as const, invoices: fullyPaidInvoices, action: 'none' as const },
  ];

  return (
    <>
      <div className="mt-8 grid gap-6 xl:grid-cols-4">
        {sections.map((section) => (
          <Card key={section.key}>
            <CardTitle className="mb-4 text-base">{t(section.key)}</CardTitle>
            <div className="space-y-3">
              {section.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                section.invoices.slice(0, 4).map((inv) => (
                  <div key={inv.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{inv.unit?.unit_number ?? inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(inv.due_date, loc)}</p>
                      </div>
                      <Badge status={inv.status} label={tc(inv.status)} />
                    </div>
                    <p className="mt-2 text-sm font-medium">{formatCurrency(Number(inv.amount) - Number(inv.paid_amount), loc)}</p>
                    {canEdit && section.action === 'issue' && inv.status === 'due' && (
                      <Button
                        className="mt-3 w-full"
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedInvoice(inv); setIssueOpen(true); }}
                      >
                        <FileText className="h-4 w-4" />
                        {ti('issueInvoice')}
                      </Button>
                    )}
                    {canEdit && section.action === 'pay' && (
                      <Button
                        className="mt-3 w-full"
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedInvoice(inv); setPaymentMode('full'); setPayOpen(true); }}
                      >
                        <CreditCard className="h-4 w-4" />
                        {ti('recordPayment')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title={ti('issueInvoice')}>
        <form onSubmit={handleIssue} className="space-y-4">
          <Input name="invoice_number" label={ti('invoiceNumber')} required />
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setIssueOpen(false)}>{tCommon('cancel')}</Button>
            <Button type="submit">{ti('issueInvoice')}</Button>
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
                <Button type="button" variant={paymentMode === 'full' ? 'primary' : 'outline'} onClick={() => setPaymentMode('full')}>
                  {tp('fullPayment')}
                </Button>
                <Button type="button" variant={paymentMode === 'partial' ? 'primary' : 'outline'} onClick={() => setPaymentMode('partial')}>
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
