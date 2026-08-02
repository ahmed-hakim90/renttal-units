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
import {
  calculateContractBillingSchedule,
  getContractDisplayStatus,
} from '@/lib/rental/calculations';
import { applyOpeningBalanceToSchedule } from '@/lib/rental/contract-opening-balance';
import { getInvoiceDisplayStatus } from '@/lib/rental/invoice-display';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/routing';
import type { Contract, ContractAttachment, InvoiceStatus } from '@/types/database';

interface ContractScheduleRow {
  key: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: InvoiceStatus | 'overdue';
}

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

function draftScheduleRows(contract: Contract): ContractScheduleRow[] {
  if (
    contract.status !== 'draft'
    || !contract.start_date
    || !contract.end_date
    || !contract.lines?.length
  ) {
    return [];
  }

  try {
    return applyOpeningBalanceToSchedule(
      calculateContractBillingSchedule({
        start_date: contract.start_date,
        end_date: contract.end_date,
        payment_cycle: contract.payment_cycle,
        payment_conditions: contract.payment_conditions,
        lines: contract.lines.map((line) => ({
          contractLineId: line.id,
          lineType: line.line_type,
          unitId: line.unit_id,
          description: line.description,
          odooProductId: line.odoo_product_id,
          odooProductName: line.odoo_product_name,
          amount: Number(line.amount),
          amountBasis: line.amount_basis === 'annual_untaxed'
            ? 'annual_untaxed' as const
            : 'contract_total_inclusive' as const,
          annualAmountUntaxed: line.annual_amount_untaxed,
          taxRate: Number(line.tax_rate),
          taxTreatment: line.tax_treatment,
          sortOrder: line.sort_order,
        })),
      }),
      {
        paid_through_date: contract.paid_through_date,
        opening_paid_amount: contract.opening_paid_amount,
      },
    ).map((period) => ({
      key: `${period.periodStart}-${period.periodEnd}`,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dueDate: period.periodStart,
      amount: period.amount,
      paidAmount: period.paid_amount,
      status: period.status,
    }));
  } catch {
    // Incomplete drafts remain editable; the form will show schedule validation errors.
    return [];
  }
}

export async function ContractDetail({
  contract,
  selectedAttachment,
  previewUrl,
  locale,
  canEdit = false,
}: {
  contract: Contract;
  selectedAttachment: ContractAttachment | null;
  previewUrl: string | null;
  locale: string;
  canEdit?: boolean;
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
  const projectedSchedule = invoices.length === 0 ? draftScheduleRows(contract) : [];
  const isProjectedSchedule = projectedSchedule.length > 0;
  const rentIncreaseCondition = (contract.payment_conditions ?? []).find(
    (condition) => condition.condition_type === 'percentage_increase_after'
      && condition.target === 'rental',
  );
  const scheduleRows: ContractScheduleRow[] = invoices.length > 0
    ? invoices.map((invoice) => ({
        key: invoice.id,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
        dueDate: invoice.due_date,
        amount: Number(invoice.amount),
        paidAmount: Number(invoice.paid_amount),
        status: getInvoiceDisplayStatus(invoice),
      }))
    : projectedSchedule;

  return (
    <div>
      <PageHeader
        compact
        title={contract.contract_number}
        subtitle={[
          contract.tenant?.full_name,
          contractUnitLabels(contract),
          locationName(contract, locale),
        ].filter(Boolean).join(' · ')}
        actions={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canEdit && contract.status === 'draft' && (
              <Link
                href={`/contracts/${contract.id}/edit`}
                className={buttonStyles({ size: 'sm' })}
              >
                <Pencil />
                {t('continueDraft')}
              </Link>
            )}
            {canEdit && contract.status === 'active' && (
              <Link
                href={`/contracts/${contract.id}/edit`}
                className={buttonStyles({ size: 'sm' })}
              >
                <Pencil />
                {t('edit')}
              </Link>
            )}
            <Link href="/contracts" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
              <ArrowLeft className="rtl:rotate-180" />
              {tc('back')}
            </Link>
          </div>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.95fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-3 sm:p-4">
              <CardDescription className="text-xs">{t('status')}</CardDescription>
              <div className="mt-2">
                <Badge status={displayStatus} label={t(displayStatus)} />
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <CardDescription className="text-xs">{t('totalAmount')}</CardDescription>
              <CardTitle className="mt-1.5 text-sm sm:text-base">
                {formatCurrency(Number(contract.total_amount), loc)}
              </CardTitle>
            </Card>
            <Card className="p-3 sm:p-4">
              <CardDescription className="text-xs">{t('paymentCycle')}</CardDescription>
              <CardTitle className="mt-1.5 text-sm sm:text-base">
                {tc(`paymentCycle.${contract.payment_cycle}`)}
              </CardTitle>
            </Card>
            <Card className="p-3 sm:p-4">
              <CardDescription className="text-xs">{t('taxMode')}</CardDescription>
              <CardTitle className="mt-1.5 text-sm sm:text-base">
                {t(contract.tax_mode === 'taxable' ? 'taxable' : 'nonTaxable')}
              </CardTitle>
            </Card>
          </div>

          <section className="surface-panel overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <UserRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{t('contractDetails')}</h2>
            </div>
            <dl className="grid gap-x-5 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t('period')}</dt>
                <dd className="mt-0.5 font-medium">
                  {contract.start_date ? formatDate(contract.start_date, loc) : '—'}
                  {' - '}
                  {contract.end_date ? formatDate(contract.end_date, loc) : '—'}
                </dd>
              </div>
              {contract.odoo_tracking_start_date && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('odooTrackingStartDate')}</dt>
                  <dd className="mt-0.5 font-medium">
                    {formatDate(contract.odoo_tracking_start_date, loc)}
                  </dd>
                </div>
              )}
              {rentIncreaseCondition && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('paymentConditionsSection')}</dt>
                  <dd className="mt-0.5 font-medium">
                    {rentIncreaseCondition.enabled
                      ? t('rentIncreaseSummary', {
                          years: rentIncreaseCondition.applies_after_months / 12,
                          percentage: rentIncreaseCondition.percentage,
                        })
                      : t('rentIncreaseDisabled')}
                  </dd>
                </div>
              )}
              {contract.status === 'cancelled' && (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('cancellationDate')}</dt>
                    <dd className="mt-0.5 font-medium">
                      {contract.cancellation_date ? formatDate(contract.cancellation_date, loc) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('cancellationHandling')}</dt>
                    <dd className="mt-0.5 font-medium">
                      {contract.cancellation_handling
                        ? t(contract.cancellation_handling === 'prorate_current'
                          ? 'prorateCurrent'
                          : 'keepCurrentFull')
                        : '—'}
                    </dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantName')}</dt>
                <dd className="mt-0.5 font-medium" dir="auto">{contract.tenant?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantPhone')}</dt>
                <dd className="mt-0.5 font-medium" dir="ltr">{contract.tenant?.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantEmail')}</dt>
                <dd className="mt-0.5 break-words font-medium" dir="ltr">{contract.tenant?.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('tenantNationalId')}</dt>
                <dd className="mt-0.5 font-medium" dir="ltr">{contract.tenant?.national_id ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('notes')}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap font-medium" dir="auto">{contract.notes ?? '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="surface-panel overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <Home className="size-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">{t('linesSection')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('lineCount', { count: contract.lines?.length ?? 0 })}
                </p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {(contract.lines ?? []).map((line) => (
                <div key={line.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium" dir="auto">
                      {line.line_type === 'rental'
                        ? line.unit?.unit_number ?? t('rentalLine')
                        : line.description || t('serviceLine')}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {line.line_type === 'rental'
                        ? t('rentalLine')
                        : line.odoo_product_name || t('serviceLine')}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(Number(line.amount), loc)}
                    </p>
                    {line.amount_basis === 'annual_untaxed' && line.annual_amount_untaxed != null && (
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {t('annualAmountUntaxed')}: {formatCurrency(Number(line.annual_amount_untaxed), loc)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-panel overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <ReceiptText className="size-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">{t('schedule')}</h2>
                <p className="text-xs text-muted-foreground">
                  {isProjectedSchedule
                    ? t('plannedInvoiceCount', { count: scheduleRows.length })
                    : t('invoiceCount', { count: scheduleRows.length })}
                </p>
              </div>
            </div>
            {isProjectedSchedule && (
              <p className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                {t('draftScheduleHint')}
              </p>
            )}
            {scheduleRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('noInvoices')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">{t('period')}</th>
                      <th className="px-4 py-2 text-start font-medium">{t('dueDate')}</th>
                      <th className="px-4 py-2 text-start font-medium">{t('amount')}</th>
                      <th className="px-4 py-2 text-start font-medium">{t('paidAmount')}</th>
                      <th className="px-4 py-2 text-start font-medium">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((row) => (
                      <tr key={row.key} className="border-t border-border">
                        <td className="whitespace-nowrap px-4 py-2">
                          {formatDate(row.periodStart, loc)} – {formatDate(row.periodEnd, loc)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">{formatDate(row.dueDate, loc)}</td>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                          {formatCurrency(row.amount, loc)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                          {formatCurrency(row.paidAmount, loc)}
                        </td>
                        <td className="px-4 py-2">
                          <Badge status={row.status} label={ts(row.status)} className="text-[11px]" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <section className="surface-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{t('documentPreview')}</h2>
                {selectedAttachment && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="auto">
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
