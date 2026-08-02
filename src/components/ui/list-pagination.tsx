'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { buttonStyles } from '@/components/ui/button';

export function ListPagination({
  page,
  totalPages,
  total,
}: {
  page: number;
  totalPages: number;
  total: number;
}) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function hrefFor(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete('page');
    else params.set('page', String(nextPage));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {t('pageStatus', { page, count: totalPages, total })}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={buttonStyles({ variant: 'outline', size: 'sm' })}>
            {t('previous')}
          </Link>
        ) : (
          <span className={buttonStyles({ variant: 'outline', size: 'sm', className: 'pointer-events-none opacity-50' })}>
            {t('previous')}
          </span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={buttonStyles({ variant: 'outline', size: 'sm' })}>
            {t('next')}
          </Link>
        ) : (
          <span className={buttonStyles({ variant: 'outline', size: 'sm', className: 'pointer-events-none opacity-50' })}>
            {t('next')}
          </span>
        )}
      </div>
    </div>
  );
}
