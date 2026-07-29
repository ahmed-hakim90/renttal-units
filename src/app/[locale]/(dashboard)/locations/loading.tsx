import { getTranslations } from 'next-intl/server';
import { ListPageSkeleton, LoadingRegion } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <LoadingRegion label={t('loading')}>
      <ListPageSkeleton columns={4} />
    </LoadingRegion>
  );
}
