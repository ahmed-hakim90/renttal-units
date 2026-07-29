import { getTranslations } from 'next-intl/server';
import { LoadingRegion, ReportPageSkeleton } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <LoadingRegion label={t('loading')}>
      <ReportPageSkeleton summaryCount={12} />
    </LoadingRegion>
  );
}
