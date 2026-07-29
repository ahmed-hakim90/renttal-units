import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getInvoices } from '@/lib/actions/invoices';
import { InvoicesTable } from '@/components/invoices/invoices-table';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';
import { getPublicOdooSettings } from '@/lib/odoo/settings';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function FullyPaidPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'invoices.view', ctx);
  const featureFlags = await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role });
  if (!featureFlags.invoices_payment_status_pages) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('invoices');
  const [invoices, odooSettings] = await Promise.all([
    getInvoices(locale, { status: 'fully_paid' }),
    getPublicOdooSettings(ctx),
  ]);

  return (
    <div>
      <PageHeader title={t('fullyPaid')} />
      <InvoicesTable
        invoices={invoices}
        locale={locale}
        canEdit={false}
        odooBaseUrl={odooSettings.url}
        showOdooActions={featureFlags.odoo_invoices_documents}
      />
    </div>
  );
}
