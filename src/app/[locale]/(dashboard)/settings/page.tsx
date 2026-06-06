import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getSettings } from '@/lib/actions/admin';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { SettingsForm } from '@/components/settings/settings-form';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('settings');
  const [settings, auth] = await Promise.all([
    getSettings(locale),
    getAuthContext({ correlation_id: await getCorrelationId() }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <SettingsForm settings={settings} locale={locale} canEdit={auth?.isAdminEditor ?? false} />
    </div>
  );
}
