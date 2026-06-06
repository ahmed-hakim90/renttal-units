import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardTitle } from '@/components/ui/card';
import { getDashboardStats, getDueThisMonth, getInvoices } from '@/lib/actions/invoices';
import { getPortfolioSummary } from '@/lib/actions/admin';
import { DashboardStatsCards } from '@/components/dashboard/stats-cards';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  const [stats, summary, dueInvoices, awaitingInvoices, partialInvoices, fullyPaidInvoices, auth] = await Promise.all([
    getDashboardStats(locale),
    getPortfolioSummary(locale),
    getDueThisMonth(locale),
    getInvoices(locale, { status: 'invoice_issued' }),
    getInvoices(locale, { status: 'partially_paid' }),
    getInvoices(locale, { status: 'fully_paid' }),
    getAuthContext({ correlation_id: await getCorrelationId() }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <DashboardStatsCards stats={stats} locale={locale} />
      <div className="mt-8 grid gap-6 lg:grid-cols-4">
        <Card>
          <CardTitle>{t('totalUnits')}</CardTitle>
          <p className="mt-2 text-3xl font-bold">{summary.totalUnits}</p>
        </Card>
        <Card>
          <CardTitle>{t('totalLocations')}</CardTitle>
          <p className="mt-2 text-3xl font-bold">{summary.totalLocations}</p>
        </Card>
        <Card>
          <CardTitle>{t('occupancyRate')}</CardTitle>
          <p className="mt-2 text-3xl font-bold">{summary.occupancyRate}%</p>
        </Card>
        <Card>
          <CardTitle>{t('monthlyRevenue')}</CardTitle>
          <p className="mt-2 text-3xl font-bold">{summary.monthlyRevenue.toLocaleString()} SAR</p>
        </Card>
      </div>
      <RecentActivity
        dueInvoices={dueInvoices}
        awaitingInvoices={awaitingInvoices}
        partialInvoices={partialInvoices}
        fullyPaidInvoices={fullyPaidInvoices}
        locale={locale}
        canEdit={auth?.isAdminEditor ?? false}
      />
    </div>
  );
}
