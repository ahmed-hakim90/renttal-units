import { getTranslations } from 'next-intl/server';
import { FormPageSkeleton, LoadingRegion } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <LoadingRegion label={t('loading')}>
      <FormPageSkeleton sections={3} />
    </LoadingRegion>
  );
}
