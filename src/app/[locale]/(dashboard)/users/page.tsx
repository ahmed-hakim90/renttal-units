import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getUsers } from '@/lib/actions/admin';
import { UsersManager } from '@/components/users/users-manager';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('users');
  const auth = await getAuthContext({ correlation_id: await getCorrelationId() });

  if (!auth?.isAdminEditor) {
    return (
      <div>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <p className="text-muted-foreground">{t('viewerDesc')}</p>
      </div>
    );
  }

  const users = await getUsers(locale);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <UsersManager users={users} locale={locale} canEdit />
    </div>
  );
}
