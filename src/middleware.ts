import createMiddleware from 'next-intl/middleware';
import { type NextRequest } from 'next/server';
import { redirectLocalelessPath } from '@/lib/i18n/localeless-path';
import { routing } from '@/lib/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const localelessRedirect = redirectLocalelessPath(request);
  if (localelessRedirect) return localelessRedirect;

  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();

  const supabaseResponse = await updateSession(request);
  const intlResponse = intlMiddleware(request);

  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value);
  });

  intlResponse.headers.set('x-correlation-id', correlationId);
  return intlResponse;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*|api).*)'],
};
