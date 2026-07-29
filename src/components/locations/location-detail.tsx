'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, FileText, Rows3 } from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { Location, Unit, UnitStatus } from '@/types/database';
import type { OdooInvoiceDocument } from '@/types/database';
import { OdooDocumentsTable } from '@/components/invoices/odoo-documents-table';

type StatusFilter = 'all' | UnitStatus;

function getLocationName(location: Location, locale: string) {
  return locale === 'ar'
    ? location.name_ar || location.name_en
    : location.name_en || location.name_ar;
}

function getLocationSubtitle(location: Location) {
  return [location.address, location.city, location.region].filter(Boolean).join(' - ');
}

export function LocationDetail({
  location,
  units,
  locale,
  canEdit,
  showLocationStatement = true,
  showOdooDocuments = true,
  odooDocuments,
}: {
  location: Location;
  units: Unit[];
  locale: string;
  canEdit: boolean;
  showLocationStatement?: boolean;
  showOdooDocuments?: boolean;
  odooDocuments: OdooInvoiceDocument[];
}) {
  const t = useTranslations('locations');
  const tc = useTranslations('common');
  const ts = useTranslations('common.status');
  const loc = locale as Locale;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const totals = useMemo(() => ({
    totalUnits: units.length,
    vacantUnits: units.filter((unit) => unit.status === 'vacant').length,
    occupiedUnits: units.filter((unit) => unit.status === 'occupied').length,
    maintenanceUnits: units.filter((unit) => unit.status === 'maintenance').length,
    activeContractCount: units.filter((unit) => unit.active_contract).length,
  }), [units]);

  const visibleUnits = useMemo(() => {
    if (statusFilter === 'all') return units;
    return units.filter((unit) => unit.status === statusFilter);
  }, [statusFilter, units]);

  const filters: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: t('allUnits'), count: totals.totalUnits },
    { key: 'vacant', label: t('vacantUnits'), count: totals.vacantUnits },
    { key: 'occupied', label: t('occupiedUnits'), count: totals.occupiedUnits },
    { key: 'maintenance', label: t('maintenanceUnits'), count: totals.maintenanceUnits },
  ];

  const statCards = [
    { key: 'totalUnits', label: t('totalUnits'), value: totals.totalUnits },
    { key: 'vacantUnits', label: t('vacantUnits'), value: totals.vacantUnits },
    { key: 'occupiedUnits', label: t('occupiedUnits'), value: totals.occupiedUnits },
    { key: 'maintenanceUnits', label: t('maintenanceUnits'), value: totals.maintenanceUnits },
    { key: 'activeContracts', label: t('activeContracts'), value: totals.activeContractCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between sm:pb-6">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{t('detailEyebrow')}</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
            {getLocationName(location, locale)}
          </h1>
          {getLocationSubtitle(location) && (
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]">
              {getLocationSubtitle(location)}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {showLocationStatement && (
            <Link
              href={`/reports/location-statement?locationId=${location.id}`}
              className={buttonStyles({ variant: 'outline' })}
            >
              <FileText className="h-4 w-4" />
              {t('locationStatement')}
            </Link>
          )}
          <Link
            href={`/units?search=${encodeURIComponent(getLocationName(location, locale))}`}
            className={buttonStyles()}
          >
            <Rows3 className="h-4 w-4" />
            {t('unitsPage')}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
          <Card key={card.key}>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="mt-2 text-3xl">{formatNumber(card.value, loc)}</CardTitle>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>{t('unitsTableTitle')}</CardTitle>
              <CardDescription className="mt-1">{t('unitsTableSubtitle')}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setStatusFilter(filter.key)}
                  className={[
                    'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors',
                    statusFilter === filter.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-accent',
                  ].join(' ')}
                >
                  {filter.label}
                  <span className="tabular-nums">{formatNumber(filter.count, loc)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {visibleUnits.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t('noUnitsForFilter')}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-3 md:hidden">
              {visibleUnits.map((unit) => (
                <article key={unit.id} className="mobile-card">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/units/${unit.id}`}
                      className="min-w-0 break-words font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {unit.unit_number}
                    </Link>
                    <Badge status={unit.status} label={ts(unit.status)} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('tenant')}</dt>
                      <dd className="mt-0.5 break-words" dir="auto">
                        {unit.tenant?.full_name ?? unit.active_contract?.tenant?.full_name ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('activeContract')}</dt>
                      <dd className="mt-0.5 break-words" dir="auto">{unit.active_contract?.contract_number ?? '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">{t('rent')}</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">
                        {unit.monthly_rent == null ? '—' : formatCurrency(Number(unit.monthly_rent), loc)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t('unitNumber')}</th>
                  <th className="px-4 py-3 text-start font-medium">{t('status')}</th>
                  <th className="px-4 py-3 text-start font-medium">{t('tenant')}</th>
                  <th className="px-4 py-3 text-start font-medium">{t('activeContract')}</th>
                  <th className="px-4 py-3 text-end font-medium">{t('rent')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUnits.map((unit) => (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/units/${unit.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {unit.unit_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={unit.status} label={ts(unit.status)} />
                    </td>
                    <td className="px-4 py-3">{unit.tenant?.full_name ?? unit.active_contract?.tenant?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">{unit.active_contract?.contract_number ?? '—'}</td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      {unit.monthly_rent == null ? '—' : formatCurrency(Number(unit.monthly_rent), loc)}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {showOdooDocuments && (
        <section className="surface-panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">{t('odooDocuments')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('odooDocumentsSubtitle')}</p>
          </div>
          <OdooDocumentsTable documents={odooDocuments} locale={locale} />
        </section>
      )}

      {!canEdit && (
        <p className="text-sm text-muted-foreground">{tc('viewOnly')}</p>
      )}
    </div>
  );
}
