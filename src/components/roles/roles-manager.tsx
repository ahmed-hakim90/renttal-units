'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import {
  PERMISSION_CATALOG,
  type PermissionCategory,
  type PermissionKey,
} from '@/lib/auth/permissions';
import { createRole, deleteRole, updateRole } from '@/lib/actions/roles';
import type { RoleSummary } from '@/types/database';

const CATEGORY_ORDER: PermissionCategory[] = [
  'locations',
  'units',
  'tenants',
  'contracts',
  'invoices',
  'payments',
  'reports',
  'imports',
  'odoo',
  'users',
  'roles',
  'settings',
  'feature_flags',
  'audit',
];

function emptyForm() {
  return {
    name_en: '',
    name_ar: '',
    description_en: '',
    description_ar: '',
    permission_keys: [] as PermissionKey[],
  };
}

export function RolesManager({
  roles,
  locale,
  canEdit,
}: {
  roles: RoleSummary[];
  locale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const uiLocale = useLocale();
  const { isSubmitting, runOnce } = useSingleSubmit();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleSummary | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      permissions: PERMISSION_CATALOG.filter((item) => item.category === category),
    })).filter((group) => group.permissions.length > 0);
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(role: RoleSummary) {
    if (role.is_system_owner) {
      toast.error(t('ownerLocked'));
      return;
    }
    setEditing(role);
    setForm({
      name_en: role.name_en,
      name_ar: role.name_ar,
      description_en: role.description_en ?? '',
      description_ar: role.description_ar ?? '',
      permission_keys: (role.permission_keys ?? []).filter(Boolean) as PermissionKey[],
    });
    setOpen(true);
  }

  function togglePermission(key: PermissionKey) {
    setForm((current) => {
      const selected = new Set(current.permission_keys);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { ...current, permission_keys: [...selected] };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    await runOnce(async () => {
      const payload = {
        name_en: form.name_en,
        name_ar: form.name_ar,
        description_en: form.description_en,
        description_ar: form.description_ar,
        permission_keys: form.permission_keys,
      };

      const result = editing
        ? await updateRole(locale, editing.id, payload)
        : await createRole(locale, payload);

      if (result.success) {
        toast.success(editing ? t('updated') : t('created'));
        setOpen(false);
        setEditing(null);
        setForm(emptyForm());
      } else {
        toast.error(result.error ?? tc('error'));
      }
    });
  }

  async function handleDelete(roleId: string) {
    await runOnce(async () => {
      const result = await deleteRole(locale, roleId);
      if (result.success) {
        toast.success(t('deleted'));
        setConfirmDeleteId(null);
      } else {
        toast.error(result.error ?? tc('error'));
      }
    });
  }

  function roleLabel(role: RoleSummary) {
    return uiLocale === 'ar' ? role.name_ar : role.name_en;
  }

  return (
    <>
      {canEdit && (
        <div className="toolbar">
          <div />
          <Button className="w-full sm:w-auto" onClick={openCreate}>
            <Plus />
            {t('create')}
          </Button>
        </div>
      )}

      {roles.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">{t('empty')}</div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="surface-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="icon-tile bg-primary/10 text-primary">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{roleLabel(role)}</h2>
                      {role.is_system_owner && <Badge status="success" label={t('systemOwner')} />}
                      {role.is_system && !role.is_system_owner && <Badge status="vacant" label={t('systemRole')} />}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(uiLocale === 'ar' ? role.description_ar : role.description_en) || t('noDescription')}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('permissionCount', { count: role.permission_keys?.length ?? 0 })}
                      {' · '}
                      {t('userCount', { count: role.user_count ?? 0 })}
                    </p>
                  </div>
                </div>
                {canEdit && !role.is_system_owner && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" type="button" onClick={() => openEdit(role)}>
                      <Pencil />
                      {tc('edit')}
                    </Button>
                    {!role.is_system && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={(role.user_count ?? 0) > 0}
                        onClick={() => setConfirmDeleteId(role.id)}
                      >
                        <Trash2 />
                        {tc('delete')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => !isSubmitting && setOpen(false)}
        title={editing ? t('edit') : t('create')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t('nameEn')}
              value={form.name_en}
              onChange={(e) => setForm((current) => ({ ...current, name_en: e.target.value }))}
              required
            />
            <Input
              label={t('nameAr')}
              value={form.name_ar}
              onChange={(e) => setForm((current) => ({ ...current, name_ar: e.target.value }))}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t('descriptionEn')}
              value={form.description_en}
              onChange={(e) => setForm((current) => ({ ...current, description_en: e.target.value }))}
            />
            <Input
              label={t('descriptionAr')}
              value={form.description_ar}
              onChange={(e) => setForm((current) => ({ ...current, description_ar: e.target.value }))}
            />
          </div>

          <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border border-border p-3">
            {grouped.map((group) => (
              <div key={group.category}>
                <h3 className="mb-2 text-sm font-semibold">{t(`categories.${group.category}`)}</h3>
                <div className="space-y-2">
                  {group.permissions.map((permission) => {
                    const checked = form.permission_keys.includes(permission.key);
                    return (
                      <label
                        key={permission.key}
                        className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => togglePermission(permission.key)}
                        />
                        <span>
                          <span className="block text-sm font-medium">{t(`permissions.${permission.key}`)}</span>
                          <span className="block text-xs text-muted-foreground">{permission.key}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="form-actions">
            <Button variant="outline" type="button" disabled={isSubmitting} onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? tc('loading') : tc('save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDeleteId)}
        onClose={() => !isSubmitting && setConfirmDeleteId(null)}
        title={t('confirmDeleteTitle')}
      >
        <p className="text-sm text-muted-foreground">{t('confirmDeleteDescription')}</p>
        <div className="form-actions mt-4">
          <Button variant="outline" type="button" disabled={isSubmitting} onClick={() => setConfirmDeleteId(null)}>
            {tc('cancel')}
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || !confirmDeleteId}
            onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
          >
            {isSubmitting ? tc('loading') : tc('delete')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
