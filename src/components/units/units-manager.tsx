'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { Button, buttonStyles } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListSearch, useListSearchValue } from '@/components/ui/list-search';
import { Modal } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { CatalogProductSkeleton, LoadingRegion } from '@/components/ui/skeleton';
import { createUnit, updateUnit, deleteUnit } from '@/lib/actions/units';
import {
  createOdooProductForUnit,
  createUnitFromOdooProduct,
  linkUnitToOdooProduct,
  refreshOdooUnitCatalog,
  searchOdooProducts,
  syncOdooServiceProductCatalog,
} from '@/lib/actions/odoo-unit-catalog';
import { isFeatureDisabledResult } from '@/lib/features';
import {
  parseOdooProductLabel,
  suggestLocationForOdooProduct,
  suggestUnitForOdooProduct,
} from '@/lib/odoo/product-match';
import { toast } from 'sonner';
import { Building2, Clock3, Link2, MapPin, PackageSearch, Plus, Pencil, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/i18n/format';
import { matchesSearch } from '@/lib/search/matches-search';
import type { Unit, Location, OdooServiceProduct, UnitStatus } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

type ManualUnitStatus = Extract<UnitStatus, 'vacant' | 'maintenance'>;
const MANUAL_UNIT_STATUSES: ManualUnitStatus[] = ['vacant', 'maintenance'];
type OdooProductRow = {
  id: number;
  name: string;
  default_code: string | null;
  display_name: string;
  description: string | null;
  category_id: number | null;
  category_name: string | null;
  suggested_unit_number: string;
  suggested_location_id: string | null;
  suggested_location_name: string | null;
};

function getManualStatus(unit: Unit | null): ManualUnitStatus {
  if (unit?.status === 'maintenance') return 'maintenance';
  return 'vacant';
}

export function UnitsManager({
  units,
  locations,
  locale,
  canEdit,
  showOdooCatalogButton,
  showOdooServiceCatalogButton,
  allowCreateOdooProduct,
  allowLinkOdooProduct,
  initialServiceProducts,
  serviceCategoryId,
}: {
  units: Unit[];
  locations: Location[];
  locale: string;
  canEdit: boolean;
  showOdooCatalogButton: boolean;
  showOdooServiceCatalogButton: boolean;
  allowCreateOdooProduct: boolean;
  allowLinkOdooProduct: boolean;
  initialServiceProducts: OdooServiceProduct[];
  serviceCategoryId: number | null;
}) {
  const t = useTranslations('units');
  const tc = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const loc = locale as Locale;
  const router = useRouter();
  const search = useListSearchValue();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [formLocationId, setFormLocationId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [selectedStatus, setSelectedStatus] = useState<ManualUnitStatus>('vacant');
  const [linkingUnit, setLinkingUnit] = useState<Unit | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<Array<{ id: number; name?: unknown; default_code?: unknown; display_name?: unknown }>>([]);
  const [productsOpen, setProductsOpen] = useState(false);
  const [serviceProductsOpen, setServiceProductsOpen] = useState(false);
  const [serviceProducts, setServiceProducts] = useState(initialServiceProducts);
  const [serviceProductQuery, setServiceProductQuery] = useState('');
  const [serviceProductsLoading, setServiceProductsLoading] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogLimit] = useState(500);
  const [catalogProducts, setCatalogProducts] = useState<OdooProductRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedUnitByProduct, setSelectedUnitByProduct] = useState<Record<number, string>>({});
  const [createLocationByProduct, setCreateLocationByProduct] = useState<Record<number, string>>({});
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Set<number>>(new Set());
  const [bulkLocationId, setBulkLocationId] = useState('');
  const [odooFilter, setOdooFilter] = useState<'all' | 'linked' | 'unlinked'>('all');

  const linkedCount = useMemo(() => units.filter((unit) => unit.odoo_product_id).length, [units]);
  const unlinkedCount = units.length - linkedCount;
  const unitByProductId = useMemo(() => {
    const map = new Map<number, Unit>();
    for (const unit of units) {
      if (unit.odoo_product_id) map.set(unit.odoo_product_id, unit);
    }
    return map;
  }, [units]);
  const unlinkedUnits = useMemo(() => units.filter((unit) => !unit.odoo_product_id), [units]);
  const visibleCatalogProducts = useMemo(() => {
    const term = catalogQuery.trim().toLowerCase();
    if (!term) return catalogProducts;
    return catalogProducts.filter((product) => [
      product.id,
      product.name,
      product.display_name,
      product.default_code,
      product.suggested_location_name,
    ].join(' ').toLowerCase().includes(term));
  }, [catalogProducts, catalogQuery]);
  const visibleServiceProducts = useMemo(
    () => serviceProducts.filter((product) => matchesSearch(serviceProductQuery, [
      product.odoo_product_id,
      product.name,
      product.display_name,
      product.default_code,
      product.category_id,
      product.category_name,
    ])),
    [serviceProductQuery, serviceProducts],
  );

  const visibleUnits = useMemo(() => {
    const filteredByOdoo = units.filter((unit) => {
      if (odooFilter === 'linked') return Boolean(unit.odoo_product_id);
      if (odooFilter === 'unlinked') return !unit.odoo_product_id;
      return true;
    });
    return filteredByOdoo.filter((unit) => matchesSearch(search, [
      unit.unit_number,
      unit.floor,
      unit.area_sqm,
      unit.monthly_rent,
      unit.payment_cycle,
      unit.rent_start_date,
      unit.rent_end_date,
      unit.location?.name_en,
      unit.location?.name_ar,
      unit.location?.address,
      unit.location?.city,
      unit.location?.region,
      unit.tenant?.full_name,
      unit.tenant?.phone,
      unit.tenant?.email,
      unit.tenant?.national_id,
      unit.tenant?.vat,
      unit.status,
      tc(`status.${unit.status}`),
      unit.active_contract?.contract_number,
      unit.active_contract?.start_date,
      unit.active_contract?.end_date,
      unit.active_contract?.total_amount,
      unit.active_contract?.notes,
      unit.odoo_product_reference,
      unit.odoo_product_id,
      unit.odoo_product_name,
      unit.odoo_product_display_name,
      unit.odoo_product_description,
      unit.odoo_product_category_id,
      unit.odoo_product_category_name,
      unit.odoo_sync_status,
      unit.odoo_product_id ? t('linked') : t('notLinked'),
    ]));
  }, [odooFilter, search, t, tc, units]);

  function openCreateModal() {
    setEditing(null);
    setFormLocationId('');
    setSelectedStatus('vacant');
    setOpen(true);
  }

  function openEditModal(unit: Unit) {
    setEditing(unit);
    setFormLocationId(unit.location_id);
    setSelectedStatus(getManualStatus(unit));
    setOpen(true);
  }

  function closeModal() {
    if (isSavingRef.current) return;
    setOpen(false);
  }

  function getActionErrorMessage(error: string) {
    if (error === 'featureDisabled') return tFeature('featureDisabled');
    if (error === 'duplicateUnit') return t('duplicateUnit');
    if (error === 'unitHasFinancialRecords') return t('unitHasFinancialRecords');
    if (error === 'unitNotFound') return t('unitNotFound');
    if (error === 'odooManagedUnitName') return t('odooManagedUnitName');
    return t('saveFailed');
  }

  function getOdooUnitErrorMessage(error?: string) {
    if (error === 'featureDisabled') return tFeature('featureDisabled');
    if (error === 'productNotFound') return t('odooProductNotFound');
    if (error === 'unitNotFound') return t('unitNotFound');
    if (error === 'productAlreadyLinked') return t('odooProductAlreadyLinked');
    if (error === 'duplicateUnit') return t('duplicateUnit');
    return error || t('odooActionFailed');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSavingRef.current) return;

    const fd = new FormData(e.currentTarget);
    const data: {
      location_id: string;
      unit_number: string;
      floor?: string;
      area_sqm?: number;
      status?: ManualUnitStatus;
    } = {
      location_id: fd.get('location_id') as string,
      unit_number: fd.get('unit_number') as string,
      floor: (fd.get('floor') as string) || undefined,
      area_sqm: fd.get('area_sqm') ? Number(fd.get('area_sqm')) : undefined,
    };
    if (!editing?.active_contract) data.status = fd.get('status') as ManualUnitStatus;

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const result = editing
        ? await updateUnit(locale, editing.id, data)
        : await createUnit(locale, { ...data, status: selectedStatus });

      if (result.success) {
        toast.success(tc('success'));
        setOpen(false);
        setEditing(null);
      } else {
        toast.error(result.error ? getActionErrorMessage(result.error) : tc('error'));
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleProductSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const results = await searchOdooProducts(locale, productQuery);
      setProductResults(results as Array<{ id: number; name?: unknown; default_code?: unknown; display_name?: unknown }>);
    } catch {
      toast.error(t('odooProductSearchFailed'));
    }
  }

  async function handleLoadCatalogProducts(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setCatalogLoading(true);
    try {
      const result = await refreshOdooUnitCatalog(locale, catalogLimit);
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      const products = result.products as OdooProductRow[];
      setCatalogProducts(products);

      const nextLocations: Record<number, string> = {};
      const nextUnits: Record<number, string> = {};

      for (const product of products) {
        const suggestedLocation = suggestLocationForOdooProduct(product, locations);
        if (suggestedLocation) nextLocations[product.id] = suggestedLocation.id;

        const suggestedUnit = suggestUnitForOdooProduct(product, unlinkedUnits, suggestedLocation?.id);
        if (suggestedUnit) nextUnits[product.id] = suggestedUnit.id;
      }

      setCreateLocationByProduct((current) => ({ ...nextLocations, ...current }));
      setSelectedUnitByProduct((current) => ({ ...nextUnits, ...current }));
      setSelectedCatalogIds((current) => new Set(
        [...current].filter((productId) => products.some((product) => product.id === productId)),
      ));

      if (result.sync.updatedCount > 0) {
        toast.success(t('odooUnitDetailsSynced', { count: result.sync.updatedCount }));
        router.refresh();
      }
      if (result.sync.errorCount > 0) {
        toast.error(t('odooUnitNameSyncFailed', { count: result.sync.errorCount }));
      }
      if (products.length === 0) toast.info(t('noOdooProducts'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('odooProductSearchFailed'));
    } finally {
      setCatalogLoading(false);
    }
  }

  async function openProductsCatalog() {
    setProductsOpen(true);
    if (catalogProducts.length === 0) await handleLoadCatalogProducts();
  }

  async function handleSyncServiceProducts() {
    if (serviceProductsLoading) return;
    setServiceProductsLoading(true);
    try {
      const result = await syncOdooServiceProductCatalog(locale);
      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }
      if (!result.success) {
        toast.error(
          result.error === 'serviceCategoryNotConfigured'
            ? t('serviceCategoryNotConfigured')
            : t('serviceProductSyncFailed'),
        );
        return;
      }
      setServiceProducts(result.products);
      toast.success(t('serviceProductsSynced', { count: result.count }));
    } catch {
      toast.error(t('serviceProductSyncFailed'));
    } finally {
      setServiceProductsLoading(false);
    }
  }

  function toggleCatalogProduct(productId: number) {
    setSelectedCatalogIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleVisibleCatalogProducts() {
    const selectable = visibleCatalogProducts.filter((product) => !unitByProductId.has(product.id));
    setSelectedCatalogIds((current) => {
      const allSelected = selectable.length > 0 && selectable.every((product) => current.has(product.id));
      const next = new Set(current);
      for (const product of selectable) {
        if (allSelected) next.delete(product.id);
        else next.add(product.id);
      }
      return next;
    });
  }

  async function handleBulkCreateUnits() {
    const products = catalogProducts.filter((product) => (
      selectedCatalogIds.has(product.id) && !unitByProductId.has(product.id)
    ));
    if (products.length === 0) return;
    if (!window.confirm(t('confirmBulkCreateUnits', { count: products.length }))) return;

    setCatalogLoading(true);
    let created = 0;
    const failures: string[] = [];
    try {
      for (const product of products) {
        const locationId = bulkLocationId
          || createLocationByProduct[product.id]
          || suggestLocationForOdooProduct(product, locations)?.id
          || '';
        if (!locationId) {
          failures.push(`${product.display_name}: ${t('selectLocation')}`);
          continue;
        }
        const result = await createUnitFromOdooProduct(locale, {
          locationId,
          productId: product.id,
        });
        if (result.success) created += 1;
        else failures.push(`${product.display_name}: ${getOdooUnitErrorMessage(result.error ? String(result.error) : undefined)}`);
      }
      if (created > 0) toast.success(t('odooBulkUnitsCreated', { count: created }));
      if (failures.length > 0) toast.error(failures.slice(0, 3).join('\n'));
      setSelectedCatalogIds(new Set());
      router.refresh();
      await handleLoadCatalogProducts();
    } finally {
      setCatalogLoading(false);
    }
  }

  function applySuggestedLocations() {
    const nextLocations: Record<number, string> = {};
    const nextUnits: Record<number, string> = {};
    let applied = 0;

    for (const product of catalogProducts) {
      if (unitByProductId.has(product.id)) continue;
      const suggestedLocation = suggestLocationForOdooProduct(product, locations);
      if (!suggestedLocation) continue;
      nextLocations[product.id] = suggestedLocation.id;
      applied += 1;
      const suggestedUnit = suggestUnitForOdooProduct(product, unlinkedUnits, suggestedLocation.id);
      if (suggestedUnit) nextUnits[product.id] = suggestedUnit.id;
    }

    setCreateLocationByProduct((current) => ({ ...current, ...nextLocations }));
    setSelectedUnitByProduct((current) => ({ ...current, ...nextUnits }));
    if (applied === 0) toast.info(t('noSuggestedLocation'));
    else toast.success(t('applySuggestedLocations'));
  }

  async function handleCreateOdooProduct(unit: Unit) {
    const result = await createOdooProductForUnit(locale, unit.id);
    if (result.success) {
      toast.success(t('odooProductCreated'));
      router.refresh();
    } else {
      toast.error(getOdooUnitErrorMessage(result.error ? String(result.error) : undefined));
    }
  }

  async function handleLinkProduct(productId: number) {
    if (!linkingUnit) return;
    const result = await linkUnitToOdooProduct(locale, linkingUnit.id, productId);
    if (result.success) {
      toast.success(t('odooProductLinked'));
      setLinkingUnit(null);
      setProductResults([]);
      setProductQuery('');
      router.refresh();
    } else {
      toast.error(getOdooUnitErrorMessage(result.error ? String(result.error) : undefined));
    }
  }

  async function handleCatalogLinkProduct(product: OdooProductRow) {
    const unitId = selectedUnitByProduct[product.id];
    if (!unitId) {
      toast.error(t('selectUnitForProduct'));
      return;
    }
    const result = await linkUnitToOdooProduct(locale, unitId, product.id);
    if (result.success) {
      toast.success(t('odooProductLinked'));
      router.refresh();
      await handleLoadCatalogProducts();
    } else {
      toast.error(getOdooUnitErrorMessage(result.error ? String(result.error) : undefined));
    }
  }

  async function handleCatalogCreateUnit(product: OdooProductRow) {
    const locationId = createLocationByProduct[product.id]
      || suggestLocationForOdooProduct(product, locations)?.id
      || '';
    if (!locationId) {
      toast.error(t('selectLocation'));
      return;
    }
    const result = await createUnitFromOdooProduct(locale, {
      locationId,
      productId: product.id,
    });
    if (result.success) {
      toast.success(t('odooUnitCreatedFromProduct'));
      router.refresh();
      await handleLoadCatalogProducts();
    } else {
      toast.error(getOdooUnitErrorMessage(result.error ? String(result.error) : undefined));
    }
  }

  return (
    <>
      <div className="toolbar">
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
          <ListSearch />
          <div className="filter-group">
            {([
              ['all', t('allUnits'), units.length],
              ['linked', t('linkedUnits'), linkedCount],
              ['unlinked', t('unlinkedUnits'), unlinkedCount],
            ] as const).map(([key, label, count]) => (
              <Button
                key={key}
                type="button"
                variant={odooFilter === key ? 'secondary' : 'ghost'}
                size="sm"
                className={odooFilter === key ? 'shadow-sm' : undefined}
                onClick={() => setOdooFilter(key)}
              >
                {label}
                <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {count}
                </span>
              </Button>
            ))}
          </div>
        </div>
        {(canEdit || showOdooCatalogButton || showOdooServiceCatalogButton) && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {showOdooCatalogButton && (
              <Button variant="outline" className="w-full sm:w-auto" onClick={openProductsCatalog}>
                <PackageSearch />
                {t('loadOdooProducts')}
              </Button>
            )}
            {showOdooServiceCatalogButton && (
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setServiceProductsOpen(true)}>
                <RefreshCw />
                {t('serviceProducts')}
              </Button>
            )}
            {canEdit && (
              <Button className="w-full sm:w-auto" onClick={openCreateModal}>
                <Plus />
                {t('create')}
              </Button>
            )}
          </div>
        )}
      </div>

      {visibleUnits.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">
          {search.trim() ? tc('noResults') : t('empty')}
        </div>
      ) : (
        <>
        <div className="grid gap-3 md:hidden">
          {visibleUnits.map((unit) => (
              <div key={unit.id} className="mobile-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/units/${unit.id}`}
                      dir="auto"
                      title={unit.unit_number}
                      className="block truncate font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {unit.unit_number}
                    </Link>
                    <p className="text-sm text-muted-foreground">{unit.location?.name_en ?? '—'}</p>
                  </div>
                  <Badge className="shrink-0" status={unit.status} label={tc(`status.${unit.status}`)} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('floor')}</p>
                    <p>{unit.floor || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('areaSqm')}</p>
                    <p>{unit.area_sqm ?? '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t('contractStatus')}</p>
                    <Badge
                      status={unit.active_contract ? 'active' : 'inactive'}
                      label={unit.active_contract ? t('hasActiveContract') : t('noActiveContract')}
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t('odooProduct')}</p>
                    <p dir="auto" className="break-words">
                      {unit.odoo_product_id ? unit.odoo_product_name ?? unit.unit_number : t('notLinked')}
                    </p>
                    {unit.odoo_product_id && (
                      <p className="text-xs text-muted-foreground">
                        {t('odooId')} {unit.odoo_product_id}
                        {unit.odoo_product_reference ? ` · ${unit.odoo_product_reference}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                {(canEdit || allowLinkOdooProduct || allowCreateOdooProduct) && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {canEdit && (
                      <Button className="min-w-0" variant="outline" size="sm" onClick={() => openEditModal(unit)}>
                        <Pencil />
                        {tc('edit')}
                      </Button>
                    )}
                    <Link
                      href={`/units/${unit.id}`}
                      className={buttonStyles({ variant: 'outline', size: 'sm', className: 'min-w-0' })}
                    >
                      <Clock3 />
                      {t('history')}
                    </Link>
                    {allowLinkOdooProduct && (
                      <Button className="min-w-0" variant="outline" size="sm" onClick={() => setLinkingUnit(unit)}>
                        <Link2 />
                        {t('linkOdooProduct')}
                      </Button>
                    )}
                    {allowCreateOdooProduct && !unit.odoo_product_id && (
                      <Button className="min-w-0" variant="outline" size="sm" onClick={() => handleCreateOdooProduct(unit)}>
                        <Plus />
                        {t('createOdooProduct')}
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        className="col-span-2"
                        variant="outline"
                        size="sm"
                        aria-label={tc('delete')}
                        onClick={async () => {
                      if (!confirm(t('deleteConfirm'))) return;
                      const r = await deleteUnit(locale, unit.id);
                      if (r.success) toast.success(tc('success'));
                      else toast.error(r.error ? getActionErrorMessage(r.error) : tc('error'));
                    }}>
                        <Trash2 className="text-destructive" />
                        {tc('delete')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
          ))}
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>{t('unitNumber')}</th>
                <th>{t('location')}</th>
                <th>{t('floor')}</th>
                <th>{t('areaSqm')}</th>
                <th>{t('contractStatus')}</th>
                <th>{t('odooProduct')}</th>
                <th>{t('status')}</th>
                {(canEdit || allowLinkOdooProduct || allowCreateOdooProduct) && <th className="!text-end">{tc('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {visibleUnits.map((unit) => (
                  <tr key={unit.id}>
                    <td className="font-medium">
                      <Link
                        href={`/units/${unit.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {unit.unit_number}
                      </Link>
                    </td>
                    <td>{unit.location?.name_en ?? '—'}</td>
                    <td>{unit.floor || '—'}</td>
                    <td>{unit.area_sqm ?? '—'}</td>
                    <td>
                      <Badge
                        status={unit.active_contract ? 'active' : 'inactive'}
                        label={unit.active_contract ? t('hasActiveContract') : t('noActiveContract')}
                      />
                    </td>
                    <td>
                      {unit.odoo_product_id ? (
                        <div className="max-w-sm">
                          <p className="font-medium" dir="auto">{unit.odoo_product_name ?? unit.unit_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('odooId')} {unit.odoo_product_id}
                            {unit.odoo_product_reference ? ` · ${unit.odoo_product_reference}` : ''}
                          </p>
                        </div>
                      ) : (
                        <Badge status="unlinked" label={t('notLinked')} />
                      )}
                    </td>
                    <td><Badge status={unit.status} label={tc(`status.${unit.status}`)} /></td>
                    {(canEdit || allowLinkOdooProduct || allowCreateOdooProduct) && (
                      <td className="text-end">
                        <div className="row-actions">
                          {allowLinkOdooProduct && (
                            <Button variant="ghost" size="icon-sm" title={t('linkOdooProduct')} aria-label={t('linkOdooProduct')} onClick={() => setLinkingUnit(unit)}>
                              <Link2 />
                            </Button>
                          )}
                          <Link
                            href={`/units/${unit.id}`}
                            className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
                            title={t('history')}
                            aria-label={t('history')}
                          >
                            <Clock3 />
                          </Link>
                          {allowCreateOdooProduct && !unit.odoo_product_id && (
                            <Button variant="ghost" size="icon-sm" title={t('createOdooProduct')} aria-label={t('createOdooProduct')} onClick={() => handleCreateOdooProduct(unit)}>
                              <Plus />
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon-sm" title={tc('edit')} aria-label={tc('edit')} onClick={() => openEditModal(unit)}>
                                <Pencil />
                              </Button>
                              <Button variant="ghost" size="icon-sm" title={tc('delete')} aria-label={tc('delete')} onClick={async () => {
                                if (!confirm(t('deleteConfirm'))) return;
                                const r = await deleteUnit(locale, unit.id);
                                if (r.success) toast.success(tc('success'));
                                else toast.error(r.error ? getActionErrorMessage(r.error) : tc('error'));
                              }}>
                                <Trash2 className="text-destructive" />
                              </Button>
                            </>
                          )}
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

      <Modal open={open} onClose={closeModal} title={editing ? t('edit') : t('create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <SearchableSelect
            searchable
            name="location_id"
            label={t('location')}
            value={formLocationId}
            onChange={setFormLocationId}
            placeholder={t('selectLocation')}
            options={[
              { value: '', label: t('selectLocation') },
              ...locations.map((location) => ({
                value: location.id,
                label: location.name_ar || location.name_en,
                keywords: [location.name_en, location.name_ar, location.city, location.address],
              })),
            ]}
          />
          <Input
            name="unit_number"
            label={editing?.odoo_product_id ? t('odooProductName') : t('unitNumber')}
            defaultValue={editing?.unit_number}
            readOnly={Boolean(editing?.odoo_product_id)}
            className={editing?.odoo_product_id ? 'bg-muted/50' : undefined}
            required
          />
          <Input name="floor" label={t('floor')} defaultValue={editing?.floor ?? ''} />
          <Input name="area_sqm" label={t('areaSqm')} type="number" step="0.01" defaultValue={editing?.area_sqm ?? ''} />
          {editing?.active_contract ? (
            <div>
              <p className="text-sm font-medium">{t('status')}</p>
              <div className="mt-1.5 flex h-10 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm">
                {tc('status.occupied')}
              </div>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium">{t('status')}</label>
              <select
                name="status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as ManualUnitStatus)}
                className="field-control"
              >
                {MANUAL_UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>{tc(`status.${s}`)}</option>
                ))}
              </select>
            </div>
          )}
          {editing?.odoo_product_id && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{t('odooDetails')}</h3>
                <Badge status="linked" label={t('linked')} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('odooProductName')}</p>
                <p className="mt-1 text-sm font-medium" dir="auto">
                  {editing.odoo_product_name ?? editing.unit_number}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t('odooId')}</p>
                  <p className="mt-1 text-sm tabular-nums">{editing.odoo_product_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('odooReference')}</p>
                  <p className="mt-1 text-sm">{editing.odoo_product_reference || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('odooCategory')}</p>
                  <p className="mt-1 text-sm" dir="auto">
                    {editing.odoo_product_category_name || '—'}
                    {editing.odoo_product_category_id ? ` · ${editing.odoo_product_category_id}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('odooLastSync')}</p>
                  <p className="mt-1 text-sm">
                    {editing.odoo_last_sync_at ? formatDate(editing.odoo_last_sync_at, loc) : '—'}
                  </p>
                </div>
              </div>
              {editing.odoo_product_description && (
                <div>
                  <p className="text-xs text-muted-foreground">{t('odooDescription')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm" dir="auto">
                    {editing.odoo_product_description}
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="form-actions">
            <Button variant="outline" type="button" disabled={isSaving} onClick={closeModal}>{tc('cancel')}</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? tc('loading') : tc('save')}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(linkingUnit)} onClose={() => setLinkingUnit(null)} title={t('linkOdooProduct')}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{linkingUnit?.unit_number}</p>
          <form onSubmit={handleProductSearch} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input name="product_search" label={t('odooProductSearch')} value={productQuery} onChange={(event) => setProductQuery(event.target.value)} />
            </div>
            <Button type="submit">
              <Search />
              {t('search')}
            </Button>
          </form>
          <div className="max-h-72 overflow-auto rounded-xl border border-border">
            {productResults.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t('noOdooProducts')}</p>
            ) : (
              productResults.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="block w-full border-b border-border px-4 py-3 text-start text-sm transition-colors hover:bg-muted/50"
                  onClick={() => handleLinkProduct(product.id)}
                >
                  <span className="font-medium">{String(product.display_name ?? product.name ?? product.id)}</span>
                  <span className="ms-2 text-muted-foreground">{String(product.default_code ?? '')}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      <Modal open={productsOpen} onClose={() => setProductsOpen(false)} title={t('odooProductsTitle')} className="max-w-5xl">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('odooProductsCategoryHint')}</p>
          <form onSubmit={handleLoadCatalogProducts} className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input
              name="catalog_search"
              label={t('odooProductSearch')}
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder={t('odooProductSearchPlaceholder')}
            />
            <Button type="submit" disabled={catalogLoading} className="w-full sm:w-auto">
              <Search />
              {catalogLoading ? tc('loading') : t('refreshOdooProducts')}
            </Button>
          </form>

          {catalogProducts.length > 0 && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {visibleCatalogProducts.length} / {catalogProducts.length} · {t('suggestedLocationHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={toggleVisibleCatalogProducts}>
                    {t('toggleVisibleProducts')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={applySuggestedLocations}>
                    <Sparkles />
                    {t('applySuggestedLocations')}
                  </Button>
                </div>
              </div>
              {selectedCatalogIds.size > 0 && (
                <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      searchable
                      label={t('bulkLocation')}
                      value={bulkLocationId}
                      onChange={setBulkLocationId}
                      placeholder={t('useSuggestedLocation')}
                      options={[
                        { value: '', label: t('useSuggestedLocation') },
                        ...locations.map((location) => ({
                          value: location.id,
                          label: location.name_ar || location.name_en,
                          keywords: [location.name_en, location.name_ar, location.city],
                        })),
                      ]}
                    />
                  </div>
                  <Button type="button" onClick={handleBulkCreateUnits} disabled={catalogLoading}>
                    <Building2 />
                    {t('createSelectedUnits', { count: selectedCatalogIds.size })}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pe-1">
            {catalogLoading && catalogProducts.length === 0 ? (
              <LoadingRegion label={tc('loading')}>
                <CatalogProductSkeleton rows={4} />
              </LoadingRegion>
            ) : visibleCatalogProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {t('noOdooProducts')}
              </div>
            ) : (
              visibleCatalogProducts.map((product) => {
                const linkedUnit = unitByProductId.get(product.id);
                const label = parseOdooProductLabel(product);
                const suggestedLocation = suggestLocationForOdooProduct(product, locations);
                const selectedLocationId = createLocationByProduct[product.id] ?? suggestedLocation?.id ?? '';
                const unitsForLink = (() => {
                  const preferred = selectedLocationId
                    ? unlinkedUnits.filter((unit) => unit.location_id === selectedLocationId)
                    : [];
                  const rest = unlinkedUnits.filter((unit) => unit.location_id !== selectedLocationId);
                  return [...preferred, ...rest];
                })();

                return (
                  <div key={product.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={selectedCatalogIds.has(product.id)}
                          disabled={Boolean(linkedUnit)}
                          onChange={() => toggleCatalogProduct(product.id)}
                          aria-label={t('selectProduct')}
                        />
                        <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge status="pending" label={`#${product.id}`} />
                          {label.code && <Badge status="linked" label={label.code} />}
                          {suggestedLocation ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                              <MapPin className="h-3.5 w-3.5" />
                              {suggestedLocation.name_en}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t('noSuggestedLocation')}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold tracking-tight">{label.title}</p>
                          {label.subtitle && (
                            <p className="mt-0.5 text-sm text-muted-foreground" dir="auto">{label.subtitle}</p>
                          )}
                        </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {linkedUnit ? (
                          <Badge status="linked" label={`${linkedUnit.unit_number} · ${linkedUnit.location?.name_en ?? ''}`} />
                        ) : (
                          <Badge status="unlinked" label={t('notLinked')} />
                        )}
                      </div>
                    </div>

                    {!linkedUnit && (
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                            {t('linkExistingUnit')}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <SearchableSelect
                              searchable
                              className="min-w-0 flex-1"
                              value={selectedUnitByProduct[product.id] ?? ''}
                              onChange={(value) => setSelectedUnitByProduct((current) => ({ ...current, [product.id]: value }))}
                              placeholder={t('selectUnit')}
                              options={[
                                { value: '', label: t('selectUnit') },
                                ...unitsForLink.map((unit) => ({
                                  value: unit.id,
                                  label: `${unit.unit_number} · ${unit.location?.name_ar || unit.location?.name_en || '—'}`,
                                  keywords: [unit.unit_number, unit.location?.name_en, unit.location?.name_ar],
                                })),
                              ]}
                            />
                            <Button type="button" variant="outline" size="sm" onClick={() => handleCatalogLinkProduct(product)}>
                              {t('link')}
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {t('createUnitFromProduct')}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <SearchableSelect
                              searchable
                              value={selectedLocationId}
                              onChange={(value) => setCreateLocationByProduct((current) => ({ ...current, [product.id]: value }))}
                              placeholder={t('selectLocation')}
                              options={[
                                { value: '', label: t('selectLocation') },
                                ...locations.map((location) => ({
                                  value: location.id,
                                  label: `${location.name_ar || location.name_en}${suggestedLocation?.id === location.id ? ` · ${t('suggestedLocation')}` : ''}`,
                                  keywords: [location.name_en, location.name_ar, location.city],
                                })),
                              ]}
                            />
                            <Button type="button" size="sm" onClick={() => handleCatalogCreateUnit(product)}>
                              <Plus />
                              {t('create')}
                            </Button>
                          </div>
                          {suggestedLocation && selectedLocationId === suggestedLocation.id && (
                            <p className="mt-2 text-xs text-primary">{t('createInSuggestedLocation')}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={serviceProductsOpen}
        onClose={() => setServiceProductsOpen(false)}
        title={t('serviceProductsTitle')}
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            {serviceCategoryId ? (
              <p>
                {t('serviceProductsCategoryHint')}{' '}
                <span className="font-medium text-foreground" dir="ltr">#{serviceCategoryId}</span>
              </p>
            ) : (
              <p className="text-destructive">{t('serviceCategoryNotConfigured')}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input
              name="service_product_search"
              label={t('odooProductSearch')}
              value={serviceProductQuery}
              onChange={(event) => setServiceProductQuery(event.target.value)}
              placeholder={t('odooProductSearchPlaceholder')}
            />
            <Button
              type="button"
              onClick={handleSyncServiceProducts}
              disabled={!serviceCategoryId || serviceProductsLoading}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={serviceProductsLoading ? 'animate-spin' : undefined} />
              {serviceProductsLoading ? tc('loading') : t('syncServiceProducts')}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('serviceProductsCount', {
              visible: visibleServiceProducts.length,
              total: serviceProducts.length,
            })}
          </p>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pe-1">
            {visibleServiceProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {t('noServiceProductsCached')}
              </div>
            ) : (
              visibleServiceProducts.map((product) => (
                <div
                  key={product.odoo_product_id}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium" dir="auto">{product.display_name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge status="pending" label={`#${product.odoo_product_id}`} />
                        {product.default_code && <Badge status="linked" label={product.default_code} />}
                        {product.category_name && (
                          <span className="text-xs text-muted-foreground" dir="auto">
                            {product.category_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t('syncedAt', { date: formatDate(product.last_synced_at, loc) })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

    </>
  );
}
