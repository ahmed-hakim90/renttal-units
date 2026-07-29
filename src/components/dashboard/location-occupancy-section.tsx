'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import type { LocationOccupancySummary } from '@/types/database';

function getLocationName(location: Pick<LocationOccupancySummary, 'name_en' | 'name_ar'>, locale: string) {
  return locale === 'ar'
    ? location.name_ar || location.name_en
    : location.name_en || location.name_ar;
}

export function LocationOccupancySection({
  locations,
  locale,
}: {
  locations: LocationOccupancySummary[];
  locale: string;
}) {
  const t = useTranslations('dashboard');
  const loc = locale as Locale;
  const [selectedLocationId, setSelectedLocationId] = useState('all');

  const visibleLocations = useMemo(() => {
    if (selectedLocationId === 'all') return locations;
    return locations.filter((location) => location.locationId === selectedLocationId);
  }, [locations, selectedLocationId]);

  const hasUnits = locations.some((location) => location.totalUnits > 0);
  const totals = useMemo(() => locations.reduce((sum, location) => ({
    totalUnits: sum.totalUnits + location.totalUnits,
    occupiedUnits: sum.occupiedUnits + location.occupiedUnits,
    vacantUnits: sum.vacantUnits + location.vacantUnits,
    maintenanceUnits: sum.maintenanceUnits + location.maintenanceUnits,
  }), {
    totalUnits: 0,
    occupiedUnits: 0,
    vacantUnits: 0,
    maintenanceUnits: 0,
  }), [locations]);

  return (
    <section className="surface-panel mt-8 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="icon-tile bg-amber-50 text-amber-700">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('locationOccupancyTitle')}</h2>
            <p className="mt-1 text-base font-medium text-muted-foreground">
              {t('locationOccupancySummary', {
                occupied: formatNumber(totals.occupiedUnits, loc),
                total: formatNumber(totals.totalUnits, loc),
              })}
            </p>
          </div>
        </div>

        {locations.length > 0 && (
          <div className="w-full sm:max-w-xs">
            <label className="text-sm font-medium">{t('locationFilter')}</label>
            <select
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
              className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
            >
              <option value="all">{t('allLocations')}</option>
              {locations.map((location) => (
                <option key={location.locationId} value={location.locationId}>
                  {getLocationName(location, locale)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {locations.length === 0 || !hasUnits ? (
        <Card className="mt-5">
          <CardTitle>{t('locationOccupancyEmptyTitle')}</CardTitle>
          <CardDescription className="mt-2">{t('locationOccupancyEmptyDescription')}</CardDescription>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {visibleLocations.map((location) => {
            const occupancyRate = location.totalUnits > 0
              ? Math.round((location.occupiedUnits / location.totalUnits) * 100)
              : 0;
            const stats = [
              { key: 'occupiedUnits', label: t('occupiedUnits'), value: location.occupiedUnits },
              { key: 'vacantUnits', label: t('vacantUnits'), value: location.vacantUnits },
              { key: 'maintenanceUnits', label: t('maintenanceUnits'), value: location.maintenanceUnits },
            ];

            return (
              <Link key={location.locationId} href={`/locations/${location.locationId}`} className="block">
                <Card className="h-full border-amber-200/70 p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="truncate text-xl">{getLocationName(location, locale)}</CardTitle>
                    <span className="shrink-0 rounded-xl bg-amber-50 px-4 py-2 text-lg font-bold text-amber-700">
                      {formatNumber(occupancyRate, loc)}%
                    </span>
                  </div>

                  <div className="mt-5 h-3 rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-amber-600"
                      style={{ width: `${occupancyRate}%` }}
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {stats.map((stat) => (
                      <div key={stat.key} className="rounded-xl bg-muted/50 px-3 py-3 text-center">
                        <p className="text-xl font-bold tabular-nums">{formatNumber(stat.value, loc)}</p>
                        <p className="mt-1 text-sm font-medium text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-sm text-muted-foreground">
                    {t('locationUnitsSummary', { total: formatNumber(location.totalUnits, loc) })}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
