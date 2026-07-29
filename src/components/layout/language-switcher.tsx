'use client';

import { useLanguageSwitcher } from '@/lib/i18n/hooks';
import { useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher() {
  const { locale, switchLocale } = useLanguageSwitcher();
  const t = useTranslations('common.language');
  const nextLocale = locale === 'ar' ? 'en' : 'ar';
  const accessibleLabel = t('switchTo', { language: t(nextLocale) });

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={accessibleLabel}
      aria-label={accessibleLabel}
      onClick={() => switchLocale(nextLocale)}
    >
      <Languages />
    </Button>
  );
}
