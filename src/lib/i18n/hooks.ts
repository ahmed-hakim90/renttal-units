'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from './navigation';
import { type Locale, getDirection } from './routing';

export function useCurrentLocale(): Locale {
  return useLocale() as Locale;
}

export function useDirection(): 'ltr' | 'rtl' {
  const locale = useCurrentLocale();
  return getDirection(locale);
}

export function useLanguageSwitcher() {
  const locale = useCurrentLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: Locale) => {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    router.replace(pathname, { locale: newLocale });
  };

  return { locale, switchLocale };
}
