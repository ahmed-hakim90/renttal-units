import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getInvoicesPage } from '@/lib/actions/invoices';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule, hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { redirect } from '@/lib/i18n/navigation';
import { InvoicesTable } from '@/components/invoices/invoices-table';
import { ListPagination } from '@/components/ui/list-pagination';
import { getPublicOdooSettings } from '@/lib/odoo/settings';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { parseListPage } from '@/lib/pagination/list-page';

export default async function PartialPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page: rawPage } = await searchParams;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'invoices.view', ctx);
  const featureFlags = await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role });
  if (!featureFlags.invoices_payment_status_pages) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('invoices');
  const page = parseListPage(rawPage);
  const [invoicesPage, odooSettings] = await Promise.all([
    getInvoicesPage(locale, { status: 'partially_paid', page }),
    getPublicOdooSettings(ctx),
  ]);

  return (
    <div>
      <PageHeader title={t('partialPayments')} />
      <InvoicesTable
        invoices={invoicesPage.items}
        locale={locale}
        canEdit={canMutateModule(auth, 'invoices') || hasPermission(auth, 'payments.record')}
        canManageOdoo={hasPermission(auth, 'odoo.manage')}
        odooBaseUrl={odooSettings.url}
        showOdooActions={featureFlags.odoo_invoices_documents}
        showOdooManualSend={featureFlags.odoo_invoice_manual_send}
        odooIntegrationEnabled={odooSettings.enabled}
        invoiceSendVisibleStatus={odooSettings.invoiceSendVisibleStatus}
      />
      <ListPagination
        page={invoicesPage.page}
        totalPages={invoicesPage.totalPages}
        total={invoicesPage.total}
      />
    </div>
  );
}
