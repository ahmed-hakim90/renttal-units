import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getDueThisMonth } from '@/lib/actions/invoices';
import { getAuthContext, requirePermission } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { InvoicesTable } from '@/components/invoices/invoices-table';
import { getPublicOdooSettings } from '@/lib/odoo/settings';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function DueThisMonthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const authRequired = await requirePermission(locale, 'invoices.view', ctx);
  const auth = await getAuthContext(ctx);
  const featureFlags = await loadFeatureFlags({
    ...ctx,
    user_id: authRequired.userId,
    role: authRequired.role,
  });
  const t = await getTranslations('invoices');
  const [invoices, odooSettings] = await Promise.all([
    getDueThisMonth(locale),
    getPublicOdooSettings(ctx),
  ]);

  return (
    <div>
      <PageHeader
        title={t('dueThisMonth')}
        subtitle={t('dueNowSubtitle')}
      />
      <InvoicesTable
        invoices={invoices}
        locale={locale}
        canEdit={Boolean(auth && (hasPermission(auth, 'invoices.update') || hasPermission(auth, 'payments.record')))}
        odooBaseUrl={odooSettings.url}
        showOdooActions={featureFlags.odoo_invoices_documents}
      />
    </div>
  );
}
