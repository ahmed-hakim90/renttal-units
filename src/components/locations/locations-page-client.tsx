'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListSearch, useListSearchValue } from '@/components/ui/list-search';
import { Modal } from '@/components/ui/modal';
import { Link } from '@/lib/i18n/navigation';
import { createLocation, updateLocation, deleteLocation } from '@/lib/actions/locations';
import { searchOdooAnalyticAccounts } from '@/lib/actions/odoo';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { matchesSearch } from '@/lib/search/matches-search';
import { toast } from 'sonner';
import { Plus, Pencil, Search, Trash2, X } from 'lucide-react';
import type { Location } from '@/types/database';

type OdooAnalyticResult = {
  id: number;
  name?: unknown;
  code?: unknown;
  display_name?: unknown;
};

export function LocationsPageClient({
  locations, locale, canEdit,
}: {
  locations: Location[];
  locale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('locations');
  const tc = useTranslations('common');
  const search = useListSearchValue();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [analyticId, setAnalyticId] = useState<number | null>(null);
  const [analyticName, setAnalyticName] = useState('');
  const [analyticQuery, setAnalyticQuery] = useState('');
  const [analyticResults, setAnalyticResults] = useState<OdooAnalyticResult[]>([]);
  const [analyticLoading, setAnalyticLoading] = useState(false);
  const [analyticSearched, setAnalyticSearched] = useState(false);
  const { isSubmitting, runOnce } = useSingleSubmit();
  const visibleLocations = useMemo(
    () => locations.filter((location) => matchesSearch(search, [
      location.name_en,
      location.name_ar,
      location.address,
      location.city,
      location.region,
      location.odoo_analytic_account_id,
      location.odoo_analytic_account_name,
    ])),
    [locations, search],
  );

  function openLocationModal(location: Location | null) {
    setEditing(location);
    setAnalyticId(location?.odoo_analytic_account_id ?? null);
    setAnalyticName(location?.odoo_analytic_account_name ?? '');
    setAnalyticQuery('');
    setAnalyticResults([]);
    setAnalyticSearched(false);
    setOpen(true);
  }

  function getLocationErrorMessage(error?: string) {
    if (error === 'Location has units') return t('deleteWarning');
    if (error === 'locationOdooAnalyticsMigrationMissing') return t('odooAnalyticMigrationMissing');
    if (error && error.toLowerCase().includes('name')) return t('nameRequired');
    return t('saveFailed');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runOnce(async () => {
    const fd = new FormData(e.currentTarget);
    const optionalText = (name: string) => {
      const value = String(fd.get(name) ?? '').trim();
      return value || null;
    };
    const data = {
      name_en: String(fd.get('name_en') ?? '').trim(),
      name_ar: String(fd.get('name_ar') ?? '').trim(),
      address: optionalText('address'),
      city: optionalText('city'),
      region: optionalText('region'),
      odoo_analytic_account_id: analyticId,
      odoo_analytic_account_name: analyticName.trim() || null,
    };

    const result = editing
      ? await updateLocation(locale, editing.id, data)
      : await createLocation(locale, data);

    if (result.success) {
      toast.success(tc('success'));
      setOpen(false);
      setEditing(null);
      clearAnalytic();
    } else {
      toast.error('error' in result ? getLocationErrorMessage(result.error) : t('saveFailed'));
    }
    });
  }

  function formatAnalytic(result: OdooAnalyticResult) {
    const label = typeof result.display_name === 'string'
      ? result.display_name
      : typeof result.name === 'string'
        ? result.name
        : String(result.id);
    const code = typeof result.code === 'string' && !label.includes(result.code) ? `[${result.code}] ` : '';
    return `${code}${label}`;
  }

  async function handleSearchAnalytic() {
    if (analyticQuery.trim().length < 2) return;
    setAnalyticLoading(true);
    setAnalyticSearched(false);
    try {
      const results = await searchOdooAnalyticAccounts(locale, analyticQuery);
      setAnalyticResults(results as OdooAnalyticResult[]);
      setAnalyticSearched(true);
      if (results.length === 0) toast.info(t('noOdooAnalytics'));
    } catch {
      setAnalyticSearched(true);
      toast.error(t('odooAnalyticSearchFailed'));
    } finally {
      setAnalyticLoading(false);
    }
  }

  function selectAnalytic(result: OdooAnalyticResult) {
    setAnalyticId(result.id);
    setAnalyticName(formatAnalytic(result));
    setAnalyticResults([]);
    setAnalyticQuery('');
    setAnalyticSearched(false);
  }

  function clearAnalytic() {
    setAnalyticId(null);
    setAnalyticName('');
    setAnalyticQuery('');
    setAnalyticResults([]);
    setAnalyticSearched(false);
  }

  return (
    <>
      <div className="toolbar">
        <ListSearch />
        {canEdit && (
          <Button className="w-full sm:w-auto" onClick={() => openLocationModal(null)}>
            <Plus />
            {t('create')}
          </Button>
        )}
      </div>

      {visibleLocations.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">
          {search.trim() ? tc('noResults') : t('empty')}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {visibleLocations.map((loc) => {
              const analyticLabel = loc.odoo_analytic_account_name?.trim()
                || (loc.odoo_analytic_account_id != null ? `#${loc.odoo_analytic_account_id}` : '—');

              return (
                <div key={loc.id} className="mobile-card">
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/locations/${loc.id}`}
                      dir="auto"
                      title={loc.name_en}
                      className="block truncate font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {loc.name_en}
                    </Link>
                    <Link
                      href={`/locations/${loc.id}`}
                      dir="auto"
                      title={loc.name_ar}
                      className="block truncate text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {loc.name_ar}
                    </Link>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('city')}</p>
                      <p className="break-words">{loc.city?.trim() || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('region')}</p>
                      <p className="break-words">{loc.region?.trim() || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{t('address')}</p>
                      <p dir="auto" className="break-words text-muted-foreground">
                        {loc.address?.trim() || '—'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{t('odooAnalytic')}</p>
                      <p dir="auto" className="break-words" title={analyticLabel}>
                        {analyticLabel}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button className="min-w-0" variant="outline" size="sm" onClick={() => openLocationModal(loc)}>
                        <Pencil />
                        {tc('edit')}
                      </Button>
                      <Button
                        className="min-w-0"
                        variant="outline"
                        size="sm"
                        aria-label={tc('delete')}
                        onClick={async () => {
                          if (!confirm(t('deleteConfirm'))) return;
                          const result = await deleteLocation(locale, loc.id);
                          if (result.success) toast.success(tc('success'));
                          else toast.error('error' in result ? getLocationErrorMessage(result.error) : t('saveFailed'));
                        }}
                      >
                        <Trash2 className="text-destructive" />
                        {tc('delete')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('nameEn')}</th>
                  <th scope="col">{t('nameAr')}</th>
                  <th scope="col">{t('address')}</th>
                  <th scope="col">{t('city')}</th>
                  <th scope="col">{t('region')}</th>
                  <th scope="col">{t('odooAnalytic')}</th>
                  {canEdit && <th scope="col" className="!text-end">{tc('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {visibleLocations.map((loc) => (
                  <tr key={loc.id}>
                    <td className="font-medium">
                      <Link href={`/locations/${loc.id}`} className="text-primary hover:underline">
                        {loc.name_en}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/locations/${loc.id}`} className="text-primary hover:underline">
                        {loc.name_ar}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate text-muted-foreground" title={loc.address ?? undefined}>
                      {loc.address?.trim() || '—'}
                    </td>
                    <td>{loc.city?.trim() || '—'}</td>
                    <td>{loc.region?.trim() || '—'}</td>
                    <td className="max-w-[14rem] truncate" title={loc.odoo_analytic_account_name ?? undefined}>
                      {loc.odoo_analytic_account_name?.trim()
                        || (loc.odoo_analytic_account_id != null ? `#${loc.odoo_analytic_account_id}` : '—')}
                    </td>
                    {canEdit && (
                      <td className="text-end">
                        <div className="row-actions">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={tc('edit')}
                            aria-label={tc('edit')}
                            onClick={() => openLocationModal(loc)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={tc('delete')}
                            aria-label={tc('delete')}
                            onClick={async () => {
                              if (!confirm(t('deleteConfirm'))) return;
                              const result = await deleteLocation(locale, loc.id);
                              if (result.success) toast.success(tc('success'));
                              else toast.error('error' in result ? getLocationErrorMessage(result.error) : t('saveFailed'));
                            }}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={open} onClose={() => { if (!isSubmitting) { setOpen(false); setEditing(null); clearAnalytic(); } }} title={editing ? t('edit') : t('create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="name_en" label={t('nameEn')} defaultValue={editing?.name_en} required />
          <Input name="name_ar" label={t('nameAr')} defaultValue={editing?.name_ar} required />
          <Input name="address" label={t('address')} defaultValue={editing?.address ?? ''} />
          <Input name="city" label={t('city')} defaultValue={editing?.city ?? ''} />
          <Input name="region" label={t('region')} defaultValue={editing?.region ?? ''} />
          <div className="rounded-lg border border-border p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t('odooAnalytic')}</p>
                <p className="text-xs text-muted-foreground">{t('odooAnalyticHint')}</p>
              </div>
              {analyticId && (
                <Button type="button" variant="ghost" size="sm" onClick={clearAnalytic}>
                  <X />
                  {t('clearOdooAnalytic')}
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                name="odoo_analytic_query"
                label={t('searchOdooAnalytic')}
                value={analyticQuery}
                onChange={(event) => setAnalyticQuery(event.target.value)}
                placeholder={t('searchOdooAnalyticPlaceholder')}
              />
              <Button type="button" variant="outline" className="self-end" disabled={analyticLoading || analyticQuery.trim().length < 2} onClick={handleSearchAnalytic}>
                <Search />
                {analyticLoading ? tc('loading') : tc('search')}
              </Button>
            </div>
            {analyticResults.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-md border border-border">
                {analyticResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-start text-sm last:border-b-0 hover:bg-muted"
                    onClick={() => selectAnalytic(result)}
                  >
                    <span>{formatAnalytic(result)}</span>
                    <span className="text-xs text-muted-foreground">#{result.id}</span>
                  </button>
                ))}
              </div>
            )}
            {analyticSearched && analyticResults.length === 0 && (
              <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {t('noOdooAnalyticsHint')}
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Input
                label={t('odooAnalyticAccountId')}
                type="number"
                value={analyticId ?? ''}
                onChange={(event) => setAnalyticId(event.target.value ? Number(event.target.value) : null)}
                placeholder="123"
              />
              <Input
                label={t('odooAnalyticAccountName')}
                value={analyticName}
                onChange={(event) => setAnalyticName(event.target.value)}
                placeholder={t('odooAnalyticNamePlaceholder')}
              />
            </div>
          </div>
          <div className="form-actions">
            <Button variant="outline" type="button" disabled={isSubmitting} onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? tc('loading') : tc('save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
