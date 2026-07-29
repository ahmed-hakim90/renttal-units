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
    default: 'Rental Units | وحدات الإيجار',
    template: '%s | Rental Units',
  },
  description: 'Bilingual rental units management dashboard for Saudi Arabia',
  applicationName: 'Rental Units',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Rental Units',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1d4ed8' },
    { media: '(prefers-color-scheme: dark)', color: '#1d4ed8' },
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
