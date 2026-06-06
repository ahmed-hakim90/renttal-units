import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getDashboardStats, getDueThisMonth, getInvoices } from '@/lib/actions/invoices';
import { getPortfolioSummary } from '@/lib/actions/admin';
import { DashboardStatsCards } from '@/components/dashboard/stats-cards';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { getAuthContext } from '@/lib/auth/session';
import { getCorrelationId } from '@/lib/observability/correlation-id';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');
  const auth = await getAuthContext({ correlation_id: await getCorrelationId() });

  const [stats, summary] = await Promise.all([
    getDashboardStats(locale),
    getPortfolioSummary(locale),
  ]);

  if (!auth?.isAdminEditor) {
    return (
      <div>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <DashboardStatsCards stats={stats} locale={locale} canNavigate={false} />
        <PortfolioSummary summary={summary} locale={locale} canNavigate={false} />
      </div>
    );
  }

  const dueInvoices = await getDueThisMonth(locale);
  const [awaitingInvoices, partialInvoices, fullyPaidInvoices] = await Promise.all([
    getInvoices(locale, { status: 'invoice_issued' }),
    getInvoices(locale, { status: 'partially_paid' }),
    getInvoices(locale, { status: 'fully_paid' }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <DashboardStatsCards stats={stats} locale={locale} />
      <PortfolioSummary summary={summary} locale={locale} />
      <RecentActivity
        dueInvoices={dueInvoices}
        awaitingInvoices={awaitingInvoices}
        partialInvoices={partialInvoices}
        fullyPaidInvoices={fullyPaidInvoices}
        locale={locale}
        canEdit
      />
    </div>
  );
}
