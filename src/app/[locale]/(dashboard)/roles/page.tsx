import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { RolesManager } from '@/components/roles/roles-manager';
import { getRoles } from '@/lib/actions/roles';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function RolesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('roles');
  await requirePermission(locale, 'roles.manage', { correlation_id: await getCorrelationId() });

  const roles = await getRoles(locale);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <RolesManager roles={roles} locale={locale} canEdit />
    </div>
  );
}
