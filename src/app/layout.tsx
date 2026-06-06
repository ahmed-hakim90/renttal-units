import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { getDirection, routing, type Locale } from '@/lib/i18n/routing';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

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
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    shortcut: ['/favicon.ico'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PwaProvider />
        {children}
      </body>
    </html>
  );
}
