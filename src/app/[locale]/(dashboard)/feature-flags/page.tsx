import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getFeatureFlags } from '@/lib/actions/admin';
import { requirePermission } from '@/lib/auth/session';
import { FeatureFlagsForm } from '@/components/settings/feature-flags-form';
import { PageHeader } from '@/components/layout/page-header';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function FeatureFlagsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'feature_flags.manage', { correlation_id: await getCorrelationId() });
  const [t, featureFlags] = await Promise.all([
    getTranslations('featureFlags'),
    getFeatureFlags(locale),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <FeatureFlagsForm locale={locale} flags={featureFlags} />
    </div>
  );
}
