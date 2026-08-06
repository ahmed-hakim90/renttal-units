import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as 'en' | 'ar')) {
    locale = routing.defaultLocale;
  }

  const [common, dashboard, locations, units, tenants, contracts, documents, invoices, payments, reports, users, roles, audit, settings, featureFlags, notifications] =
    await Promise.all([
      import(`../../messages/${locale}/common.json`),
      import(`../../messages/${locale}/dashboard.json`),
      import(`../../messages/${locale}/locations.json`),
      import(`../../messages/${locale}/units.json`),
      import(`../../messages/${locale}/tenants.json`),
      import(`../../messages/${locale}/contracts.json`),
      import(`../../messages/${locale}/documents.json`),
      import(`../../messages/${locale}/invoices.json`),
      import(`../../messages/${locale}/payments.json`),
      import(`../../messages/${locale}/reports.json`),
      import(`../../messages/${locale}/users.json`),
      import(`../../messages/${locale}/roles.json`),
      import(`../../messages/${locale}/audit.json`),
      import(`../../messages/${locale}/settings.json`),
      import(`../../messages/${locale}/feature-flags.json`),
      import(`../../messages/${locale}/notifications.json`),
    ]);

  return {
    locale,
    messages: {
      common: common.default,
      dashboard: dashboard.default,
      locations: locations.default,
      units: units.default,
      tenants: tenants.default,
      contracts: contracts.default,
      documents: documents.default,
      invoices: invoices.default,
      payments: payments.default,
      reports: reports.default,
      users: users.default,
      roles: roles.default,
      audit: audit.default,
      settings: settings.default,
      featureFlags: featureFlags.default,
      notifications: notifications.default,
    },
  };
});
