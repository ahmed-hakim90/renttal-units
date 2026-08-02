'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { Button, buttonStyles } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListSearch, useListSearchValue } from '@/components/ui/list-search';
import { Modal } from '@/components/ui/modal';
import { createTenant, updateTenant, deleteTenant } from '@/lib/actions/tenants';
import { isFeatureDisabledResult } from '@/lib/features';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { matchesSearch } from '@/lib/search/matches-search';
import { toast } from 'sonner';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Tenant } from '@/types/database';

type TenantFormValues = {
  full_name: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  vat: string | null;
  street: string | null;
  city: string | null;
  country_code: string | null;
};

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text || null;
}

function contractsSearchHref(fullName: string) {
  return `/contracts?search=${encodeURIComponent(fullName)}`;
}

export function TenantsManager({
  tenants,
  locale,
  canCreate,
  canUpdate,
  canDelete,
}: {
  tenants: Tenant[];
  locale: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations('tenants');
  const tc = useTranslations('common');
  const tFeature = useTranslations('featureFlags');
  const router = useRouter();
  const search = useListSearchValue();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const { isSubmitting, runOnce } = useSingleSubmit();

  const visibleTenants = useMemo(
    () => tenants.filter((tenant) => matchesSearch(search, [
      tenant.full_name,
      tenant.phone,
      tenant.email,
      tenant.national_id,
      tenant.vat,
      tenant.street,
      tenant.city,
      tenant.country_code,
      tenant.odoo_partner_id,
    ])),
    [search, tenants],
  );

  function openTenantModal(tenant: Tenant | null) {
    setEditing(tenant);
    setOpen(true);
  }

  function getActionErrorMessage(error?: string) {
    if (error === 'tenantHasContracts') return t('tenantHasContracts');
    if (error === 'tenantHasInvoices') return t('tenantHasInvoices');
    if (error === 'tenantNotFound') return t('tenantNotFound');
    if (error === 'invalidTenantId') return t('invalidTenantId');
    return t('saveFailed');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOnce(async () => {
      const fd = new FormData(event.currentTarget);
      const data: TenantFormValues = {
        full_name: String(fd.get('full_name') ?? '').trim(),
        phone: optionalText(fd.get('phone')),
        email: optionalText(fd.get('email')),
        national_id: optionalText(fd.get('national_id')),
        vat: optionalText(fd.get('vat')),
        street: optionalText(fd.get('street')),
        city: optionalText(fd.get('city')),
        country_code: optionalText(fd.get('country_code')),
      };

      const result = editing
        ? await updateTenant(locale, editing.id, data)
        : await createTenant(locale, data);

      if (isFeatureDisabledResult(result)) {
        toast.error(tFeature('featureDisabled'));
        return;
      }

      if (result.success) {
        toast.success(tc('success'));
        setOpen(false);
        setEditing(null);
        router.refresh();
        return;
      }

      toast.error('error' in result ? getActionErrorMessage(result.error) : t('saveFailed'));
    });
  }

  async function handleDelete(tenant: Tenant) {
    if (!canDelete) return;
    if (!confirm(t('deleteConfirm'))) return;

    const result = await deleteTenant(locale, tenant.id);
    if (isFeatureDisabledResult(result)) {
      toast.error(tFeature('featureDisabled'));
      return;
    }
    if (result.success) {
      toast.success(tc('success'));
      router.refresh();
      return;
    }
    toast.error('error' in result ? getActionErrorMessage(result.error) : t('deleteFailed'));
  }

  return (
    <>
      <div className="toolbar">
        <ListSearch />
        {canCreate && (
          <Button className="w-full sm:w-auto" onClick={() => openTenantModal(null)}>
            <Plus />
            {t('create')}
          </Button>
        )}
      </div>

      {visibleTenants.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">
          {search.trim() ? tc('noResults') : t('empty')}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {visibleTenants.map((tenant) => (
              <div key={tenant.id} className="mobile-card">
                <div className="min-w-0 space-y-1">
                  <p dir="auto" className="truncate font-semibold" title={tenant.full_name}>
                    {tenant.full_name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground" dir="ltr">
                    {tenant.phone?.trim() || tenant.email?.trim() || '—'}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('nationalId')}</p>
                    <p className="break-words" dir="ltr">{tenant.national_id?.trim() || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('city')}</p>
                    <p className="break-words">{tenant.city?.trim() || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t('email')}</p>
                    <p className="break-words" dir="ltr">{tenant.email?.trim() || '—'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={contractsSearchHref(tenant.full_name)}
                    className={buttonStyles({ variant: 'outline', size: 'sm', className: 'min-w-0' })}
                  >
                    <ExternalLink />
                    {t('viewContracts')}
                  </Link>
                  {canUpdate && (
                    <Button className="min-w-0" variant="outline" size="sm" onClick={() => openTenantModal(tenant)}>
                      <Pencil />
                      {tc('edit')}
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      className="min-w-0"
                      variant="outline"
                      size="sm"
                      aria-label={tc('delete')}
                      onClick={() => handleDelete(tenant)}
                    >
                      <Trash2 className="text-destructive" />
                      {tc('delete')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('fullName')}</th>
                  <th scope="col">{t('phone')}</th>
                  <th scope="col">{t('email')}</th>
                  <th scope="col">{t('nationalId')}</th>
                  <th scope="col">{t('city')}</th>
                  <th scope="col" className="!text-end">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="font-medium">
                      <span dir="auto">{tenant.full_name}</span>
                    </td>
                    <td dir="ltr">{tenant.phone?.trim() || '—'}</td>
                    <td className="max-w-[12rem] truncate" dir="ltr" title={tenant.email ?? undefined}>
                      {tenant.email?.trim() || '—'}
                    </td>
                    <td dir="ltr">{tenant.national_id?.trim() || '—'}</td>
                    <td>{tenant.city?.trim() || '—'}</td>
                    <td className="text-end">
                      <div className="row-actions">
                        <Link
                          href={contractsSearchHref(tenant.full_name)}
                          className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
                          title={t('viewContracts')}
                          aria-label={t('viewContracts')}
                        >
                          <ExternalLink />
                        </Link>
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={tc('edit')}
                            aria-label={tc('edit')}
                            onClick={() => openTenantModal(tenant)}
                          >
                            <Pencil />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={tc('delete')}
                            aria-label={tc('delete')}
                            onClick={() => handleDelete(tenant)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={() => {
          if (!isSubmitting) {
            setOpen(false);
            setEditing(null);
          }
        }}
        title={editing ? t('edit') : t('create')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="full_name" label={t('fullName')} defaultValue={editing?.full_name} required />
          <Input name="phone" label={t('phone')} defaultValue={editing?.phone ?? ''} dir="ltr" />
          <Input name="email" label={t('email')} type="email" defaultValue={editing?.email ?? ''} dir="ltr" />
          <Input name="national_id" label={t('nationalId')} defaultValue={editing?.national_id ?? ''} dir="ltr" />
          <Input name="vat" label={t('vat')} defaultValue={editing?.vat ?? ''} dir="ltr" />
          <Input name="street" label={t('street')} defaultValue={editing?.street ?? ''} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="city" label={t('city')} defaultValue={editing?.city ?? ''} />
            <Input
              name="country_code"
              label={t('countryCode')}
              defaultValue={editing?.country_code ?? ''}
              dir="ltr"
              maxLength={2}
            />
          </div>
          {editing?.odoo_partner_id != null && (
            <p className="text-sm text-muted-foreground" dir="ltr">
              {t('odooPartner')}: #{editing.odoo_partner_id}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!isSubmitting) {
                  setOpen(false);
                  setEditing(null);
                }
              }}
              disabled={isSubmitting}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || (editing ? !canUpdate : !canCreate)}>
              {isSubmitting ? tc('loading') : tc('save')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
