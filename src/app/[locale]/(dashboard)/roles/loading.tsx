import { getTranslations } from 'next-intl/server';
import { LoadingRegion, RolesPageSkeleton } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <LoadingRegion label={t('loading')}>
      <RolesPageSkeleton />
    </LoadingRegion>
  );
}
