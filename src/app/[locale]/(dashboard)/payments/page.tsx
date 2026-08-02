import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getPaymentsPage } from '@/lib/actions/invoices';
import { PaymentsTable } from '@/components/payments/payments-table';
import { ListPagination } from '@/components/ui/list-pagination';
import { hasPermission } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { parseListPage } from '@/lib/pagination/list-page';

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page: rawPage } = await searchParams;
  setRequestLocale(locale);
  const auth = await requirePermission(locale, 'payments.view', {
    correlation_id: await getCorrelationId(),
  });
  const t = await getTranslations('payments');
  const page = parseListPage(rawPage);
  const paymentsPage = await getPaymentsPage(locale, { page });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <PaymentsTable
        payments={paymentsPage.items}
        locale={locale}
        canExport={hasPermission(auth, 'reports.export')}
        serverPaged
      />
      <ListPagination
        page={paymentsPage.page}
        totalPages={paymentsPage.totalPages}
        total={paymentsPage.total}
      />
    </div>
  );
}
