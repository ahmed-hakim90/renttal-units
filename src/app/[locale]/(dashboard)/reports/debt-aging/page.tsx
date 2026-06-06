import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getDebtAgingReport } from '@/lib/actions/admin';
import { getLocations } from '@/lib/actions/locations';
import { DebtAgingReport } from '@/components/reports/debt-aging-report';

export default async function DebtAgingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('reports');
  const [invoices, locations] = await Promise.all([
    getDebtAgingReport(locale),
    getLocations(locale),
  ]);

  return (
    <div>
      <PageHeader title={t('debtAging')} subtitle={t('debtAgingSubtitle')} />
      <DebtAgingReport invoices={invoices} locations={locations} locale={locale} />
    </div>
  );
}
