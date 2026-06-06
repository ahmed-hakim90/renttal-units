import { type NextRequest, NextResponse } from 'next/server';
import { defaultLocale, locales, type Locale } from './routing';

function resolveLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }
  return defaultLocale;
}

export function redirectLocalelessPath(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  if (
    pathname === '/' ||
    pathname.startsWith('/en') ||
    pathname.startsWith('/ar')
  ) {
    return null;
  }

  const locale = resolveLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}
