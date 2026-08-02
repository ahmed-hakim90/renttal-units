import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { UnitDetail } from '@/components/units/unit-detail';
import { getUnitHistory } from '@/lib/actions/units';
import { canMutateModule } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'units.view', ctx);
  const featureFlags = await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role });

  const history = await getUnitHistory(locale, id);
  if (!history.unit) notFound();

  return (
    <UnitDetail
      unit={history.unit}
      contracts={history.contracts}
      invoices={history.invoices}
      locale={locale}
      canEdit={canMutateModule(auth, 'units') && featureFlags.master_data_mutations}
    />
  );
}
