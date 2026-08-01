'use client';

import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/lib/i18n/navigation';
import { SearchableSelect } from '@/components/ui/searchable-select';

export function DashboardLocationFilter({
  locations,
  selectedLocationId,
  locale,
}: {
  locations: Array<{ id: string; name_en: string; name_ar: string }>;
  selectedLocationId: string;
  locale: string;
}) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const pathname = usePathname();

  if (locations.length === 0) return null;

  return (
    <div className="w-full sm:min-w-[14rem] sm:max-w-xs">
      <SearchableSelect
        searchable
        label={t('locationFilter')}
        className="[&>label]:sr-only"
        value={selectedLocationId || 'all'}
        onChange={(value) => {
          const next = new URLSearchParams();
          if (value && value !== 'all') {
            next.set('locationId', value);
          }
          const query = next.toString();
          router.replace(query ? `${pathname}?${query}` : pathname);
        }}
        options={[
          { value: 'all', label: t('allLocations') },
          ...locations.map((location) => ({
            value: location.id,
            label: locale === 'ar'
              ? (location.name_ar || location.name_en)
              : (location.name_en || location.name_ar),
            keywords: [location.name_en, location.name_ar],
          })),
        ]}
      />
    </div>
  );
}
