import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getInvoices } from '@/lib/actions/invoices';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { InvoicesTable } from '@/components/invoices/invoices-table';

export default async function FullyPaidPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoices');
  const [invoices, auth] = await Promise.all([
    getInvoices(locale, { status: 'fully_paid' }),
    getAuthContext({ correlation_id: await getCorrelationId() }),
  ]);

  return (
    <div>
      <PageHeader title={t('fullyPaid')} />
      <InvoicesTable invoices={invoices} locale={locale} canEdit={false} />
    </div>
  );
}
