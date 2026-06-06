import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as 'en' | 'ar')) {
    locale = routing.defaultLocale;
  }

  const [common, dashboard, locations, units, invoices, payments, reports, users, settings] =
    await Promise.all([
      import(`../../messages/${locale}/common.json`),
      import(`../../messages/${locale}/dashboard.json`),
      import(`../../messages/${locale}/locations.json`),
      import(`../../messages/${locale}/units.json`),
      import(`../../messages/${locale}/invoices.json`),
      import(`../../messages/${locale}/payments.json`),
      import(`../../messages/${locale}/reports.json`),
      import(`../../messages/${locale}/users.json`),
      import(`../../messages/${locale}/settings.json`),
    ]);

  return {
    locale,
    messages: {
      common: common.default,
      dashboard: dashboard.default,
      locations: locations.default,
      units: units.default,
      invoices: invoices.default,
      payments: payments.default,
      reports: reports.default,
      users: users.default,
      settings: settings.default,
    },
  };
});
