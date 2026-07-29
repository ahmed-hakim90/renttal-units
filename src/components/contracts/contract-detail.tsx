import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Home,
  Pencil,
  ReceiptText,
  UserRound,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { Link } from '@/lib/i18n/navigation';
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/format';
import { getContractDisplayStatus } from '@/lib/rental/calculations';
import { getInvoiceDisplayStatus } from '@/lib/rental/invoice-display';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/routing';
import type { Contract, ContractAttachment } from '@/types/database';

function contractUnitLabels(contract: Contract) {
  const rentalLines = (contract.lines ?? []).filter(
    (line) => line.line_type === 'rental' && line.unit,
  );
  if (rentalLines.length > 0) {
    return rentalLines.map((line) => line.unit?.unit_number).filter(Boolean).join(', ');
  }
  return contract.unit?.unit_number ?? '—';
}

function locationName(contract: Contract, locale: string) {
  const location = contract.unit?.location
    ?? contract.lines?.find((line) => line.unit?.location)?.unit?.location;
  if (!location) return '';
  return locale === 'ar'
    ? location.name_ar || location.name_en
    : location.name_en || location.name_ar;
}

export async function ContractDetail({
  contract,
  selectedAttachment,
  previewUrl,
  locale,
}: {
  contract: Contract;
  selectedAttachment: ContractAttachment | null;
  previewUrl: string | null;
  locale: string;
}) {
  const [t, tc, ts] = await Promise.all([
    getTranslations('contracts'),
    getTranslations('common'),
    getTranslations('common.status'),
  ]);
  const loc = locale as Locale;
  const displayStatus = getContractDisplayStatus(contract.status, contract.end_date);
  const attachments = [...(contract.attachments ?? [])].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  const invoices = [...(contract.invoices ?? [])].sort(
    (a, b) => a.due_date.localeCompare(b.due_date),
  );

  return (
    <div>
      <PageHeader
        title={contract.contract_number}
        subtitle={[
          contract.tenant?.full_name,
          contractUnitLabels(contract),
          locationName(contract, locale),
        ].filter(Boolean).join(' · ')}
        actions={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {contract.status === 'draft' && (
              <Link
                href={`/contracts/${contract.id}/edit`}
                className={buttonStyles()}
              >
                <Pencil />
                {t('continueDraft')}
              </Link>
            )}
            <Link href="/contracts" className={buttonStyles({ variant: 'outline' })}>
              <ArrowLeft className="rtl:rotate-180" />
              {tc('back')}
            </Link>
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.95fr)]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardDescription>{t('status')}</CardDescription>
              <div className="mt-3">
                <Badge status={displayStatus} label={t(displayStatus)} />
              </div>
            </Card>
            <Card>
              <CardDescription>{t('totalAmount')}</CardDescription>
              <CardTitle className="mt-2">{formatCurrency(Number(contract.total_amount), loc)}</CardTitle>
            </Card>
            <Card>
              <CardDescription>{t('paymentCycle')}</CardDescription>
              <CardTitle className="mt-2 text-base">{tc(`paymentCycle.${contract.payment_cycle}`)}</CardTitle>
            </Card>
            <Card>
              <CardDescription>{t('taxMode')}</CardDescription>
              <CardTitle className="mt-2 text-base">
                {t(contract.tax_mode === 'taxable' ? 'taxable' : 'nonTaxable')}
              </CardTitle>
            </Card>
          </div>

          <section className="surface-panel overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
              <UserRound className="size-5 text-muted-foreground" />
              <h2 className="font-semibold">{t('contractDetails')}</h2>
            </div>
            <dl className="grid gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
              <div>
                <dt className="text-xs text-muted-foreground">{t('period')}</dt>
                <dd className="mt-1 font-medium">
                  {contract.start_date ? formatDate(contract.start_date, loc) : '—'}
                  {' - '}
                  {contract.end_date ? formatDate(contract.end_date, loc) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantName')}</dt>
                <dd className="mt-1 font-medium" dir="auto">{contract.tenant?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantPhone')}</dt>
                <dd className="mt-1 font-medium" dir="ltr">{contract.tenant?.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantEmail')}</dt>
                <dd className="mt-1 break-words font-medium" dir="ltr">{contract.tenant?.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantNationalId')}</dt>
                <dd className="mt-1 font-medium" dir="ltr">{contract.tenant?.national_id ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('notes')}</dt>
                <dd className="mt-1 whitespace-pre-wrap font-medium" dir="auto">{contract.notes ?? '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="surface-panel overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
              <Home className="size-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">{t('linesSection')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('lineCount', { count: contract.lines?.length ?? 0 })}
                </p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {(contract.lines ?? []).map((line) => (
                <div key={line.id} className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <p className="font-medium" dir="auto">
                      {line.line_type === 'rental'
                        ? line.unit?.unit_number ?? t('rentalLine')
                        : line.description || t('serviceLine')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {line.line_type === 'rental'
                        ? t('rentalLine')
                        : line.odoo_product_name || t('serviceLine')}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(Number(line.amount), loc)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-panel overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
              <ReceiptText className="size-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">{t('schedule')}</h2>
                <p className="text-sm text-muted-foreground">{t('invoiceCount', { count: invoices.length })}</p>
              </div>
            </div>
            {invoices.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('noInvoices')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-5 py-3 text-start font-medium">{t('dueDate')}</th>
                      <th className="px-5 py-3 text-start font-medium">{t('amount')}</th>
                      <th className="px-5 py-3 text-start font-medium">{t('paidAmount')}</th>
                      <th className="px-5 py-3 text-start font-medium">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => {
                      const invoiceStatus = getInvoiceDisplayStatus(invoice);
                      return (
                        <tr key={invoice.id} className="border-t border-border">
                          <td className="px-5 py-3">{formatDate(invoice.due_date, loc)}</td>
                          <td className="px-5 py-3 tabular-nums">
                            {formatCurrency(Number(invoice.amount), loc)}
                          </td>
                          <td className="px-5 py-3 tabular-nums">
                            {formatCurrency(Number(invoice.paid_amount), loc)}
                          </td>
                          <td className="px-5 py-3">
                            <Badge status={invoiceStatus} label={ts(invoiceStatus)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <section className="surface-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="font-semibold">{t('documentPreview')}</h2>
                {selectedAttachment && (
                  <p className="mt-1 truncate text-sm text-muted-foreground" dir="auto">
                    {selectedAttachment.original_filename}
                  </p>
                )}
              </div>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className={buttonStyles({ variant: 'outline', size: 'sm' })}
                >
                  <ExternalLink />
                  {t('openDocument')}
                </a>
              )}
            </div>

            {attachments.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-b border-border p-3">
                {attachments.map((attachment) => (
                  <Link
                    key={attachment.id}
                    href={`/contracts/${contract.id}?document=${attachment.id}`}
                    className={cn(
                      'inline-flex h-9 max-w-56 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
                      selectedAttachment?.id === attachment.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:bg-accent',
                    )}
                    title={attachment.original_filename}
                  >
                    <FileText className="size-4 shrink-0" />
                    <span className="truncate" dir="auto">{attachment.original_filename}</span>
                  </Link>
                ))}
              </div>
            )}

            {!selectedAttachment ? (
              <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 text-center">
                <FileText className="size-12 text-muted-foreground" />
                <p className="mt-4 font-medium">{t('noContractDocument')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('noContractDocumentHint')}</p>
              </div>
            ) : previewUrl ? (
              <>
                <iframe
                  src={previewUrl}
                  title={t('documentPreviewTitle', { filename: selectedAttachment.original_filename })}
                  referrerPolicy="no-referrer"
                  className="h-[65vh] min-h-[32rem] w-full bg-muted/30"
                />
                <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                  {t('documentMeta', {
                    size: formatNumber(Math.max(0.01, selectedAttachment.byte_size / 1024 / 1024), loc),
                    date: formatDate(selectedAttachment.created_at, loc),
                  })}
                </div>
              </>
            ) : (
              <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 text-center">
                <FileText className="size-12 text-muted-foreground" />
                <p className="mt-4 font-medium">{t('previewUnavailable')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('pdfDownloadFailed')}</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
