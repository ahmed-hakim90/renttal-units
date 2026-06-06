'use client';

import { useLanguageSwitcher } from '@/lib/i18n/hooks';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const { locale, switchLocale } = useLanguageSwitcher();
  const t = useTranslations('common.language');

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      {(['en', 'ar'] as const).map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            locale === loc ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t(loc)}
        </button>
      ))}
    </div>
  );
}
