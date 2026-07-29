import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { LocationDetail } from '@/components/locations/location-detail';
import { getLocationDetail } from '@/lib/actions/locations';
import { getAuthContext, requirePermission } from '@/lib/auth/session';
import { canMutateModule } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { getOdooInvoiceDocuments } from '@/lib/actions/odoo';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const authRequired = await requirePermission(locale, 'locations.view', ctx);
  const featureFlags = await loadFeatureFlags({
    ...ctx,
    user_id: authRequired.userId,
    role: authRequired.role,
  });

  const [auth, detail, odooDocuments] = await Promise.all([
    getAuthContext(ctx),
    getLocationDetail(locale, id),
    featureFlags.odoo_invoices_documents
      ? getOdooInvoiceDocuments(locale, { locationId: id })
      : Promise.resolve([]),
  ]);

  if (!detail) notFound();

  return (
    <LocationDetail
      location={detail.location}
      units={detail.units}
      locale={locale}
      canEdit={Boolean(auth && canMutateModule(auth, 'locations') && featureFlags.master_data_mutations)}
      showLocationStatement={featureFlags.reports_operational}
      showOdooDocuments={featureFlags.odoo_invoices_documents}
      odooDocuments={featureFlags.odoo_invoices_documents ? odooDocuments : []}
    />
  );
}
