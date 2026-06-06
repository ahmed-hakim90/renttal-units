import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getInvoices } from '@/lib/actions/invoices';
import { requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { InvoicesTable } from '@/components/invoices/invoices-table';

export default async function PartialPaymentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminEditor(locale, { correlation_id: await getCorrelationId() });
  const t = await getTranslations('invoices');
  const invoices = await getInvoices(locale, { status: 'partially_paid' });

  return (
    <div>
      <PageHeader title={t('partialPayments')} />
      <InvoicesTable invoices={invoices} locale={locale} canEdit />
    </div>
  );
}
