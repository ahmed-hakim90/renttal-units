import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getUsers } from '@/lib/actions/admin';
import { UsersManager } from '@/components/users/users-manager';
import { requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('users');
  await requireAdminEditor(locale, { correlation_id: await getCorrelationId() });

  const users = await getUsers(locale);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <UsersManager users={users} locale={locale} canEdit />
    </div>
  );
}
