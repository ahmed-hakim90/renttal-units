'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  createUser,
  resetUserPassword,
  updateUserEmail,
  updateUserFullName,
  updateUserRole,
} from '@/lib/actions/admin';
import { getUserAuditLogs } from '@/lib/actions/audit';
import { AuditLogList } from '@/components/audit/audit-log-list';
import {
  isStaffPasswordValid,
  PasswordRequirements,
} from '@/components/auth/password-requirements';
import { useSingleSubmit } from '@/lib/hooks/use-single-submit';
import { formatDate } from '@/lib/i18n/format';
import { type Locale } from '@/lib/i18n/routing';
import { toast } from 'sonner';
import { Eye, Plus } from 'lucide-react';
import type { AuditLogReadModel, Profile, RoleSummary } from '@/types/database';

export function UsersManager({
  users,
  roles,
  locale,
  canEdit,
  canViewAudit,
}: {
  users: Profile[];
  roles: RoleSummary[];
  locale: string;
  canEdit: boolean;
  canViewAudit: boolean;
}) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const uiLocale = useLocale();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userAuditLogs, setUserAuditLogs] = useState<AuditLogReadModel[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [createPassword, setCreatePassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');
  const { isSubmitting, runOnce } = useSingleSubmit();
  const defaultRoleId = roles.find((role) => role.slug === 'viewer')?.id ?? roles[0]?.id ?? '';

  function roleLabel(role: RoleSummary | null | undefined) {
    if (!role) return '—';
    return uiLocale === 'ar' ? role.name_ar : role.name_en;
  }

  function getCreateUserErrorMessage(error: string) {
    if (error.includes('password') || error.includes('Password')) return t('passwordInvalid');
    if (error.includes('Email') || error.includes('email')) return t('emailInvalid');
    if (error.includes('Name') || error.includes('name')) return t('nameRequired');
    if (error.includes('role') || error.includes('Role')) return t('roleInvalid');
    return t('createFailed');
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    await runOnce(async () => {
      const fd = new FormData(e.currentTarget);
      const result = await createUser(locale, {
        full_name: fd.get('full_name') as string,
        email: fd.get('email') as string,
        temporary_password: fd.get('temporary_password') as string,
        role_id: fd.get('role_id') as string,
      });

      if (result.success) {
        toast.success(t('created'));
        setOpen(false);
        setCreatePassword('');
        e.currentTarget.reset();
      } else {
        toast.error('error' in result ? getCreateUserErrorMessage(String(result.error)) : t('createFailed'));
      }
    });
  }

  async function handleRoleChange(userId: string, roleId: string) {
    await runOnce(async () => {
      const result = await updateUserRole(locale, userId, roleId);
      if (result.success) toast.success(t('roleUpdated'));
      else toast.error(('error' in result && result.error) ? String(result.error) : tc('error'));
    });
  }

  async function openUserDetails(user: Profile) {
    setSelectedUser(user);
    setUserAuditLogs([]);
    setResetPassword('');
    setResetPasswordConfirmation('');
    if (!canViewAudit) return;
    setAuditLoading(true);
    try {
      setUserAuditLogs(await getUserAuditLogs(locale, user.id));
    } catch {
      toast.error(t('auditLoadFailed'));
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleEmailUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedUser) return;
    await runOnce(async () => {
      const fd = new FormData(e.currentTarget);
      const result = await updateUserEmail(locale, selectedUser.id, String(fd.get('email') ?? ''));
      if (result.success && result.data) {
        setSelectedUser(result.data);
        toast.success(t('emailUpdated'));
      } else {
        toast.error(t(result.error as 'emailInvalid'));
      }
    });
  }

  async function handleFullNameUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedUser) return;
    await runOnce(async () => {
      const fd = new FormData(e.currentTarget);
      const result = await updateUserFullName(
        locale,
        selectedUser.id,
        String(fd.get('full_name') ?? ''),
      );
      if (result.success && result.data) {
        setSelectedUser(result.data);
        toast.success(t('nameUpdated'));
      } else {
        toast.error(t(result.error as 'nameInvalid'));
      }
    });
  }

  async function handlePasswordReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedUser) return;
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');
    const confirmation = String(fd.get('password_confirmation') ?? '');
    if (password !== confirmation) {
      toast.error(t('passwordMismatch'));
      return;
    }

    await runOnce(async () => {
      const result = await resetUserPassword(locale, selectedUser.id, password);
      if (result.success) {
        e.currentTarget.reset();
        setResetPassword('');
        setResetPasswordConfirmation('');
        toast.success(t('passwordUpdated'));
      } else {
        toast.error(t(result.error as 'passwordInvalid'));
      }
    });
  }

  return (
    <>
      {canEdit && (
        <div className="toolbar">
          <div />
          <Button className="w-full sm:w-auto" onClick={() => setOpen(true)} disabled={roles.length === 0}>
            <Plus />
            {t('create')}
          </Button>
        </div>
      )}

      {users.length === 0 ? (
        <div className="surface-panel px-6 py-12 text-center text-muted-foreground">{t('empty')}</div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {users.map((user) => (
              <article key={user.id} className="mobile-card">
                <div className="min-w-0">
                  <p className="truncate font-semibold" dir="auto">{user.full_name ?? '—'}</p>
                  <p className="mt-0.5 break-all text-sm text-muted-foreground" dir="ltr">{user.email}</p>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('role')}</dt>
                    <dd className="mt-0.5 font-medium">{roleLabel(user.assigned_role)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('createdAt')}</dt>
                    <dd className="mt-0.5">{formatDate(user.created_at, locale as Locale)}</dd>
                  </div>
                </dl>
                {canEdit && (
                  <div className="mt-4 space-y-3 border-t border-border pt-3">
                    <label className="text-xs font-medium text-muted-foreground">{t('updateRole')}</label>
                    <select
                      defaultValue={user.role_id}
                      disabled={isSubmitting || roles.length === 0}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="field-control"
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <Button variant="outline" className="w-full" onClick={() => openUserDetails(user)}>
                      <Eye />
                      {t('viewDetails')}
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>{t('email')}</th>
                  <th>{t('fullName')}</th>
                  <th>{t('role')}</th>
                  <th>{t('createdAt')}</th>
                  {canEdit && <th className="!text-end">{t('updateRole')}</th>}
                  {canEdit && <th className="!text-end">{t('details')}</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium">{user.email}</td>
                    <td>{user.full_name ?? '—'}</td>
                    <td>{roleLabel(user.assigned_role)}</td>
                    <td>{formatDate(user.created_at, locale as Locale)}</td>
                    {canEdit && (
                      <td className="text-end">
                        <select
                          defaultValue={user.role_id}
                          disabled={isSubmitting || roles.length === 0}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="field-control mt-0 h-9 w-auto min-w-40"
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {canEdit && (
                      <td className="text-end">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t('view')}
                          aria-label={t('view')}
                          onClick={() => openUserDetails(user)}
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                      </td>
                    )}
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
            setCreatePassword('');
          }
        }}
        title={t('create')}
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input name="full_name" label={t('fullName')} required />
          <Input name="email" type="email" label={t('email')} required />
          <Input
            name="temporary_password"
            type="password"
            label={t('temporaryPassword')}
            required
            minLength={12}
            autoComplete="new-password"
            value={createPassword}
            onChange={(event) => setCreatePassword(event.target.value)}
            className={isStaffPasswordValid(createPassword)
              ? 'border-emerald-500 bg-emerald-50/50 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25 dark:bg-emerald-950/20'
              : undefined}
          />
          <PasswordRequirements password={createPassword} />
          <div>
            <label className="text-sm font-medium">{t('role')}</label>
            <select name="role_id" defaultValue={defaultRoleId} className="field-control" required>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <Button variant="outline" type="button" disabled={isSubmitting} onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={isSubmitting || !isStaffPasswordValid(createPassword)}>
              {isSubmitting ? tc('loading') : t('create')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={selectedUser !== null}
        onClose={() => {
          if (!isSubmitting) {
            setSelectedUser(null);
            setResetPassword('');
            setResetPasswordConfirmation('');
          }
        }}
        title={t('userDetails')}
        className="max-w-3xl"
      >
        {selectedUser && (
          <div className="space-y-6">
            <dl className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t('fullName')}</dt>
                <dd className="mt-1 font-medium" dir="auto">{selectedUser.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('role')}</dt>
                <dd className="mt-1 font-medium">{roleLabel(selectedUser.assigned_role)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('email')}</dt>
                <dd className="mt-1 break-all font-medium" dir="ltr">{selectedUser.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('createdAt')}</dt>
                <dd className="mt-1 font-medium">{formatDate(selectedUser.created_at, locale as Locale)}</dd>
              </div>
            </dl>

            <section>
              <h3 className="mb-3 font-semibold">{t('changeName')}</h3>
              <form onSubmit={handleFullNameUpdate} className="space-y-3">
                <Input
                  key={selectedUser.full_name}
                  name="full_name"
                  label={t('fullName')}
                  defaultValue={selectedUser.full_name ?? ''}
                  maxLength={120}
                  required
                  dir="auto"
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? tc('loading') : t('saveName')}
                  </Button>
                </div>
              </form>
            </section>

            <section className="border-t border-border pt-5">
              <h3 className="mb-3 font-semibold">{t('changeEmail')}</h3>
              <form onSubmit={handleEmailUpdate} className="space-y-3">
                <Input
                  key={selectedUser.email}
                  name="email"
                  type="email"
                  label={t('newEmail')}
                  defaultValue={selectedUser.email}
                  required
                  dir="ltr"
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? tc('loading') : t('saveEmail')}
                  </Button>
                </div>
              </form>
            </section>

            <section className="border-t border-border pt-5">
              <h3 className="font-semibold">{t('changePassword')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('permanentPasswordHint')}</p>
              <form onSubmit={handlePasswordReset} className="mt-3 space-y-3">
                <Input
                  name="password"
                  type="password"
                  label={t('newPassword')}
                  minLength={12}
                  required
                  autoComplete="new-password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  className={isStaffPasswordValid(resetPassword)
                    ? 'border-emerald-500 bg-emerald-50/50 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25 dark:bg-emerald-950/20'
                    : undefined}
                />
                <Input
                  name="password_confirmation"
                  type="password"
                  label={t('confirmPassword')}
                  minLength={12}
                  required
                  autoComplete="new-password"
                  value={resetPasswordConfirmation}
                  onChange={(event) => setResetPasswordConfirmation(event.target.value)}
                  className={
                    resetPasswordConfirmation.length > 0
                    && resetPassword === resetPasswordConfirmation
                      ? 'border-emerald-500 bg-emerald-50/50 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25 dark:bg-emerald-950/20'
                      : undefined
                  }
                />
                <PasswordRequirements
                  password={resetPassword}
                  confirmation={resetPasswordConfirmation}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={
                      isSubmitting
                      || !isStaffPasswordValid(resetPassword)
                      || resetPassword !== resetPasswordConfirmation
                    }
                  >
                    {isSubmitting ? tc('loading') : t('savePassword')}
                  </Button>
                </div>
              </form>
            </section>

            {canViewAudit && (
              <section className="border-t border-border pt-5">
                <h3 className="mb-3 font-semibold">{t('activity')}</h3>
                {auditLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{tc('loading')}</p>
                ) : (
                  <AuditLogList logs={userAuditLogs} locale={locale} compact />
                )}
              </section>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
