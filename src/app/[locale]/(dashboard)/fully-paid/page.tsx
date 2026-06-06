import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/page-header';
import { getInvoices } from '@/lib/actions/invoices';
import { InvoicesTable } from '@/components/invoices/invoices-table';

export default async function FullyPaidPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoices');
  const invoices = await getInvoices(locale, { status: 'fully_paid' });

  return (
    <div>
      <PageHeader title={t('fullyPaid')} />
      <InvoicesTable invoices={invoices} locale={locale} canEdit={false} />
    </div>
  );
}
