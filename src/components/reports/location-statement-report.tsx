'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { getLocationStatement } from '@/lib/actions/admin';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/format';
import { exportLocationStatementExcel } from '@/lib/reports/location-statement-export';
import type { Locale } from '@/lib/i18n/routing';
import type { Location, LocationStatement, LocationStatementUnit } from '@/types/database';

function getLocationName(location: Location | null | undefined, locale: string) {
  if (!location) return '—';
  return locale === 'ar'
    ? location.name_ar || location.name_en
    : location.name_en || location.name_ar;
}

function formatContractPeriod(unit: LocationStatementUnit, locale: Locale) {
  if (!unit.activeContractStartDate || !unit.activeContractEndDate) return '—';
  return `${formatDate(unit.activeContractStartDate, locale)} - ${formatDate(unit.activeContractEndDate, locale)}`;
}

export function LocationStatementReport({
  locations,
  initialLocationId,
  initialStatement,
  locale,
}: {
  locations: Location[];
  initialLocationId: string;
  initialStatement: LocationStatement | null;
  locale: string;
}) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const ts = useTranslations('common.status');
  const loc = locale as Locale;
  const [locationId, setLocationId] = useState(initialLocationId);
  const [statement, setStatement] = useState<LocationStatement | null>(initialStatement);
  const [isPending, startTransition] = useTransition();

  function handleLocationChange(nextLocationId: string) {
    setLocationId(nextLocationId);
    if (!nextLocationId) {
      setStatement(null);
      return;
    }

    startTransition(async () => {
      const nextStatement = await getLocationStatement(locale, nextLocationId);
      setStatement(nextStatement);
    });
  }

  async function exportExcel() {
    if (!statement) return;
    await exportLocationStatementExcel({
      labels: {
        reportTitle: t('locationStatement'),
        location: t('location'),
        summarySheet: t('exportSummarySheet'),
        detailSheet: t('exportDetailSheet'),
        totalUnits: t('totalUnits'),
        occupiedUnits: t('occupiedUnits'),
        vacantUnits: t('vacantUnits'),
        maintenanceUnits: t('maintenanceUnits'),
        activeContracts: t('activeContracts'),
        totalContracts: t('totalContracts'),
        totalContractValue: t('totalContractValue'),
        totalInvoicesAmount: t('totalInvoicesAmount'),
        totalPaid: t('totalPaid'),
        totalRemaining: t('totalRemaining'),
        unit: t('unit'),
        status: t('status'),
        tenant: t('tenant'),
        activeContract: t('activeContract'),
        period: t('period'),
        contractValue: t('contractValue'),
        contractCount: t('contractCount'),
        invoiceCount: t('invoiceCount'),
        invoiceTotal: t('invoiceTotal'),
        paidTotal: t('paidTotal'),
        remainingTotal: t('remainingTotal'),
        grandTotal: t('grandTotal'),
      },
      statement,
      locationName: getLocationName(statement.location, locale),
      generatedIso: new Date().toISOString().slice(0, 10),
      getStatusLabel: (status) => ts(status),
    });
  }

  if (locations.length === 0) {
    return <p className="text-muted-foreground">{t('noLocations')}</p>;
  }

  const totals = statement?.totals;
  const summaryCards = totals
    ? [
        { key: 'totalUnits', label: t('totalUnits'), value: formatNumber(totals.unitCount, loc) },
        { key: 'occupiedUnits', label: t('occupiedUnits'), value: formatNumber(totals.occupiedUnits, loc) },
        { key: 'vacantUnits', label: t('vacantUnits'), value: formatNumber(totals.vacantUnits, loc) },
        { key: 'maintenanceUnits', label: t('maintenanceUnits'), value: formatNumber(totals.maintenanceUnits, loc) },
        { key: 'activeContracts', label: t('activeContracts'), value: formatNumber(totals.activeContractCount, loc) },
        { key: 'totalContracts', label: t('totalContracts'), value: formatNumber(totals.contractCount, loc) },
        { key: 'totalContractValue', label: t('totalContractValue'), value: formatCurrency(totals.contractValueTotal, loc) },
        { key: 'totalInvoicesAmount', label: t('totalInvoicesAmount'), value: formatCurrency(totals.invoiceTotal, loc) },
        { key: 'totalPaid', label: t('totalPaid'), value: formatCurrency(totals.paidTotal, loc) },
        { key: 'totalRemaining', label: t('totalRemaining'), value: formatCurrency(totals.remainingTotal, loc) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full max-w-sm">
          <label className="text-sm font-medium">{t('filterByLocation')}</label>
          <select
            value={locationId}
            onChange={(event) => handleLocationChange(event.target.value)}
            disabled={isPending}
            className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {getLocationName(location, locale)}
              </option>
            ))}
          </select>
        </div>

        <Button type="button" onClick={exportExcel} disabled={!statement || isPending}>
          <Download className="h-4 w-4" />
          {t('exportReport')}
        </Button>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}

      {statement && totals && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <Card key={card.key}>
                <CardTitle className="text-sm text-muted-foreground">{card.label}</CardTitle>
                <p className="mt-2 text-2xl font-bold">{card.value}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-6 py-4">
              <CardTitle>{t('locationStatementDetails')}</CardTitle>
              <CardDescription className="mt-1">
                {getLocationName(statement.location, locale)}
              </CardDescription>
            </div>

            {statement.units.length === 0 ? (
              <p className="p-6 text-muted-foreground">{t('noData')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-start">{t('unit')}</th>
                      <th className="px-4 py-3 text-start">{t('status')}</th>
                      <th className="px-4 py-3 text-start">{t('tenant')}</th>
                      <th className="px-4 py-3 text-start">{t('activeContract')}</th>
                      <th className="px-4 py-3 text-start">{t('period')}</th>
                      <th className="px-4 py-3 text-end">{t('contractValue')}</th>
                      <th className="px-4 py-3 text-end">{t('contractCount')}</th>
                      <th className="px-4 py-3 text-end">{t('invoiceCount')}</th>
                      <th className="px-4 py-3 text-end">{t('invoiceTotal')}</th>
                      <th className="px-4 py-3 text-end">{t('paidTotal')}</th>
                      <th className="px-4 py-3 text-end">{t('remainingTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.units.map((unit) => (
                      <tr key={unit.unitId} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{unit.unitNumber}</td>
                        <td className="px-4 py-3">
                          <Badge status={unit.status} label={ts(unit.status)} />
                        </td>
                        <td className="px-4 py-3">{unit.tenantName ?? '—'}</td>
                        <td className="px-4 py-3">{unit.activeContractNumber ?? '—'}</td>
                        <td className="px-4 py-3">{formatContractPeriod(unit, loc)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(unit.activeContractValue, loc)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{formatNumber(unit.contractCount, loc)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{formatNumber(unit.invoiceCount, loc)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(unit.invoiceTotal, loc)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(unit.paidTotal, loc)}</td>
                        <td className="px-4 py-3 text-end tabular-nums font-medium">{formatCurrency(unit.remainingTotal, loc)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                      <td className="px-4 py-3" colSpan={5}>{t('grandTotal')}</td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {formatCurrency(statement.units.reduce((sum, unit) => sum + unit.activeContractValue, 0), loc)}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{formatNumber(totals.contractCount, loc)}</td>
                      <td />
                      <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(totals.invoiceTotal, loc)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(totals.paidTotal, loc)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(totals.remainingTotal, loc)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
