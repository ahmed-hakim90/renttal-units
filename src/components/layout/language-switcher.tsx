'use client';

import { useLanguageSwitcher } from '@/lib/i18n/hooks';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { locale, switchLocale } = useLanguageSwitcher();
  const t = useTranslations('common.language');

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-xl border border-border bg-background p-1',
        collapsed && 'lg:w-full lg:flex-col'
      )}
    >
      {(['en', 'ar'] as const).map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => switchLocale(loc)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            collapsed && 'lg:w-full lg:px-2 lg:py-1 lg:text-xs',
            locale === loc ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {collapsed ? (
            <>
              <span className="lg:hidden">{t(loc)}</span>
              <span className="hidden lg:inline">{loc.toUpperCase()}</span>
            </>
          ) : (
            t(loc)
          )}
        </button>
      ))}
    </div>
  );
}
