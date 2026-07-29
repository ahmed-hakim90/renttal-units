import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { UnitDetail } from '@/components/units/unit-detail';
import { getUnitHistory } from '@/lib/actions/units';

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const history = await getUnitHistory(locale, id);
  if (!history.unit) notFound();

  return (
    <UnitDetail
      unit={history.unit}
      contracts={history.contracts}
      invoices={history.invoices}
      locale={locale}
    />
  );
}
