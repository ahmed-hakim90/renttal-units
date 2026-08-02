import { ArrowLeft, Building2, FileText, Pencil, ReceiptText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { Contract, Invoice, Unit } from '@/types/database';

function getLocationName(unit: Unit, locale: string) {
  if (!unit.location) return '';
  return locale === 'ar'
    ? unit.location.name_ar || unit.location.name_en
    : unit.location.name_en || unit.location.name_ar;
}

export async function UnitDetail({
  unit,
  contracts,
  invoices,
  locale,
  canEdit = false,
}: {
  unit: Unit;
  contracts: Contract[];
  invoices: Invoice[];
  locale: string;
  canEdit?: boolean;
}) {
  const [t, tc] = await Promise.all([
    getTranslations('units'),
    getTranslations('common'),
  ]);
  const loc = locale as Locale;
  const locationName = getLocationName(unit, locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={unit.unit_number}
        subtitle={locationName}
        actions={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canEdit && (
              <Link
                href={`/units?edit=${unit.id}`}
                className={buttonStyles({ size: 'sm' })}
              >
                <Pencil />
                {t('edit')}
              </Link>
            )}
            <Link
              href="/units"
              className={buttonStyles({ variant: 'outline', size: 'sm' })}
            >
              <ArrowLeft className="rtl:rotate-180" />
              {t('backToUnits')}
            </Link>
          </div>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardDescription>{t('status')}</CardDescription>
          <div className="mt-3">
            <Badge status={unit.status} label={tc(`status.${unit.status}`)} />
          </div>
        </Card>
        <Card>
          <CardDescription>{t('floor')}</CardDescription>
          <CardTitle className="mt-2">{unit.floor || '—'}</CardTitle>
        </Card>
        <Card>
          <CardDescription>{t('areaSqm')}</CardDescription>
          <CardTitle className="mt-2">
            {unit.area_sqm == null ? '—' : formatNumber(Number(unit.area_sqm), loc)}
          </CardTitle>
        </Card>
        <Card>
          <CardDescription>{t('contractStatus')}</CardDescription>
          <CardTitle className="mt-2 text-base">
            {unit.active_contract ? t('hasActiveContract') : t('noActiveContract')}
          </CardTitle>
        </Card>
      </div>

      <section className="surface-panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">{t('contractsHistory')}</h2>
            <p className="text-sm text-muted-foreground">{t('contractsCount', { count: contracts.length })}</p>
          </div>
        </div>
        {contracts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('noContractsHistory')}</p>
        ) : (
          <div className="divide-y divide-border">
            {contracts.map((contract) => (
              <article key={contract.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium" dir="auto">{contract.contract_number}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {contract.start_date && contract.end_date
                        ? `${formatDate(contract.start_date, loc)} - ${formatDate(contract.end_date, loc)}`
                        : '—'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                      {contract.tenant?.full_name ?? '—'} · {tc(`paymentCycle.${contract.payment_cycle}`)} ·{' '}
                      {contract.tax_mode === 'taxable' ? t('taxable') : t('nonTaxable')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(Number(contract.total_amount), loc)}
                    </span>
                    <Badge status={contract.status} label={t(`contractStatusLabel.${contract.status}`)} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <ReceiptText className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">{t('invoicesHistory')}</h2>
            <p className="text-sm text-muted-foreground">{t('invoicesCount', { count: invoices.length })}</p>
          </div>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('noInvoicesHistory')}</p>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((invoice) => (
              <article key={invoice.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-medium" dir="auto">{invoice.invoice_number}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(invoice.period_start, loc)} - {formatDate(invoice.period_end, loc)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                      {t('odooProduct')}: {invoice.odoo_invoice_name ?? t(`odooSyncStatus.${invoice.odoo_sync_status}`)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(Number(invoice.amount), loc)}
                    </span>
                    <Badge status={invoice.status} label={tc(`status.${invoice.status}`)} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Link
        href={`/locations/${unit.location_id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <Building2 className="h-4 w-4" />
        {locationName}
      </Link>
    </div>
  );
}
