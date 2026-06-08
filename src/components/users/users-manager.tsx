'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { createUser, updateUserRole } from '@/lib/actions/admin';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { formatDate } from '@/lib/i18n/format';
import { type Locale } from '@/lib/i18n/routing';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { Profile, UserRole } from '@/types/database';

export function UsersManager({ users, locale, canEdit }: { users: Profile[]; locale: string; canEdit: boolean }) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const { isSubmitting, runOnce } = useSingleSubmit();

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    await runOnce(async () => {

    const fd = new FormData(e.currentTarget);
    const result = await createUser(locale, {
      full_name: fd.get('full_name') as string,
      email: fd.get('email') as string,
      temporary_password: fd.get('temporary_password') as string,
      role: fd.get('role') as UserRole,
    });

    if (result.success) {
      toast.success(t('created'));
      setOpen(false);
      e.currentTarget.reset();
    } else {
      toast.error('error' in result ? result.error : tc('error'));
    }
    });
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    await runOnce(async () => {
    const result = await updateUserRole(locale, userId, role);
    if (result.success) toast.success(t('roleUpdated'));
    else toast.error(tc('error'));
    });
  }

  return (
    <>
      {canEdit && (
        <Button className="mb-4 w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('create')}
        </Button>
      )}

      {users.length === 0 ? (
        <p className="mt-6 text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="mt-6 rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start">{t('email')}</th>
                <th className="px-4 py-3 text-start">{t('fullName')}</th>
                <th className="px-4 py-3 text-start">{t('role')}</th>
                <th className="px-4 py-3 text-start">{t('createdAt')}</th>
                {canEdit && <th className="px-4 py-3 text-end">{t('updateRole')}</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.full_name ?? '—'}</td>
                  <td className="px-4 py-3">{tc(`role.${user.role}`)}</td>
                  <td className="px-4 py-3">{formatDate(user.created_at, locale as Locale)}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-end">
                      <select
                        defaultValue={user.role}
                        disabled={isSubmitting}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                        className="rounded-lg border border-border px-2 py-1 text-sm"
                      >
                        <option value="admin_editor">{tc('role.admin_editor')}</option>
                        <option value="viewer">{tc('role.viewer')}</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => !isSubmitting && setOpen(false)} title={t('create')}>
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input name="full_name" label={t('fullName')} required />
          <Input name="email" type="email" label={t('email')} required />
          <Input name="temporary_password" type="password" label={t('temporaryPassword')} required minLength={8} />
          <div>
            <label className="text-sm font-medium">{t('role')}</label>
            <select name="role" defaultValue="viewer" className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm">
              <option value="viewer">{tc('role.viewer')}</option>
              <option value="admin_editor">{tc('role.admin_editor')}</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" disabled={isSubmitting} onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? tc('loading') : t('create')}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
