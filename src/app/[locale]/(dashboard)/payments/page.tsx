import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getPayments } from '@/lib/actions/invoices';
import { PaymentsTable } from '@/components/payments/payments-table';
import { requireAdminEditor } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function PaymentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminEditor(locale, { correlation_id: await getCorrelationId() });
  const t = await getTranslations('payments');
  const payments = await getPayments(locale);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <PaymentsTable payments={payments} locale={locale} />
    </div>
  );
}
