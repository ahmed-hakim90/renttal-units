import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getInvoicesPage } from '@/lib/actions/invoices';
import { getOdooInvoiceDocuments } from '@/lib/actions/odoo';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule, hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { InvoicesTable } from '@/components/invoices/invoices-table';
import { OdooDocumentsTable } from '@/components/invoices/odoo-documents-table';
import { ListPagination } from '@/components/ui/list-pagination';
import { getPublicOdooSettings } from '@/lib/odoo/settings';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';
import { parseListPage } from '@/lib/pagination/list-page';

export default async function InvoicesPage({
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
  const t = await getTranslations('invoices');
  const featureFlags = await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role });
  const page = parseListPage(rawPage);
  const [invoicesPage, odooDocuments, odooSettings] = await Promise.all([
    getInvoicesPage(locale, { status: 'invoice_issued', page }),
    featureFlags.odoo_invoices_documents
      ? getOdooInvoiceDocuments(locale, { unmatchedOnly: true })
      : Promise.resolve([]),
    getPublicOdooSettings(ctx),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title={t('awaitingPayment')} />
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
      {featureFlags.odoo_invoices_documents && odooDocuments.length > 0 && (
        <section className="surface-panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">{t('unmatchedOdooDocuments')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('unmatchedOdooDocumentsDesc')}</p>
          </div>
          <OdooDocumentsTable documents={odooDocuments} locale={locale} />
        </section>
      )}
    </div>
  );
}
