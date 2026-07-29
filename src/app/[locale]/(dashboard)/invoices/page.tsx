import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getInvoices } from '@/lib/actions/invoices';
import { requirePermission } from '@/lib/auth/session';
import { canMutateModule, hasPermission } from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { InvoicesTable } from '@/components/invoices/invoices-table';
import { OdooDocumentsTable } from '@/components/invoices/odoo-documents-table';
import { getOdooInvoiceDocuments } from '@/lib/actions/odoo';
import { getPublicOdooSettings } from '@/lib/odoo/settings';
import { loadFeatureFlags } from '@/lib/features/load-feature-flags';

export default async function InvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = { correlation_id: await getCorrelationId() };
  const auth = await requirePermission(locale, 'invoices.view', ctx);
  const t = await getTranslations('invoices');
  const featureFlags = await loadFeatureFlags({ ...ctx, user_id: auth.userId, role: auth.role });
  const [invoices, odooDocuments, odooSettings] = await Promise.all([
    getInvoices(locale, { status: 'invoice_issued' }),
    featureFlags.odoo_invoices_documents ? getOdooInvoiceDocuments(locale) : Promise.resolve([]),
    getPublicOdooSettings(ctx),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title={t('awaitingPayment')} />
      <InvoicesTable
        invoices={invoices}
        locale={locale}
        canEdit={canMutateModule(auth, 'invoices') || hasPermission(auth, 'payments.record')}
        odooBaseUrl={odooSettings.url}
        showOdooActions={featureFlags.odoo_invoices_documents}
      />
      {featureFlags.odoo_invoices_documents && (
        <section className="surface-panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">{t('odooDocuments')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('odooDocumentsDesc')}</p>
          </div>
          <OdooDocumentsTable documents={odooDocuments} locale={locale} />
        </section>
      )}
    </div>
  );
}
