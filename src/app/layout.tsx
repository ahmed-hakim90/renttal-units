import type { Metadata, Viewport } from 'next';
import { Alexandria, Tajawal } from 'next/font/google';
import { headers } from 'next/headers';
import { getDirection, routing, type Locale } from '@/lib/i18n/routing';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import './globals.css';

const alexandria = Alexandria({
  variable: '--font-alexandria',
  subsets: ['latin'],
  display: 'swap',
});

const tajawal = Tajawal({
  variable: '--font-tajawal',
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Rentara | رنتارا',
    template: '%s | Rentara',
  },
  description: 'Rentara — smarter rental management for Saudi Arabia',
  applicationName: 'Rentara',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Rentara',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#061b43' },
    { media: '(prefers-color-scheme: dark)', color: '#061b43' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const localeHeader = (await headers()).get('X-NEXT-INTL-LOCALE');
  const locale = (routing.locales.includes(localeHeader as Locale)
    ? localeHeader
    : routing.defaultLocale) as Locale;
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir}>
      <body className={`${alexandria.variable} ${tajawal.variable} font-sans antialiased`}>
        <PwaProvider />
        {children}
      </body>
    </html>
  );
}
