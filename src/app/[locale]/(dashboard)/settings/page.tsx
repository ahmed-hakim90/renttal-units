import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getSettings } from '@/lib/actions/admin';
import { getOdooIntegration } from '@/lib/actions/odoo';
import { hasPermission } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { SettingsForm } from '@/components/settings/settings-form';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'settings.manage', ctx);
  const canManageOdoo = hasPermission(auth, 'odoo.manage');
  const t = await getTranslations('settings');
  const [settings, odoo, featureFlags] = await Promise.all([
    getSettings(locale),
    canManageOdoo ? getOdooIntegration(locale) : Promise.resolve(null),
    loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <SettingsForm
        settings={settings}
        locale={locale}
        canEdit
        canEditOdoo={canManageOdoo}
        odoo={odoo}
        showExperimentalOdooTools={featureFlags.admin_experimental}
      />
    </div>
  );
}
