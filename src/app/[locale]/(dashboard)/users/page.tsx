import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getAssignableRoles, getUsers } from '@/lib/actions/admin';
import { UsersManager } from '@/components/users/users-manager';
import { requirePermission } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('users');
  const auth = await requirePermission(locale, 'users.manage', { correlation_id: await getCorrelationId() });

  const [users, roles] = await Promise.all([
    getUsers(locale),
    getAssignableRoles(locale),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <UsersManager
        users={users}
        roles={roles}
        locale={locale}
        canEdit
        canViewAudit={hasPermission(auth, 'audit.view')}
      />
    </div>
  );
}
