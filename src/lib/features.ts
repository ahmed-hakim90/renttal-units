import type { Setting } from '@/types/database';

export const FEATURE_FLAG_CATEGORIES = [
  'contracts',
  'odoo',
  'imports',
  'reports',
  'operations',
  'admin',
] as const;

export type FeatureFlagCategory = typeof FEATURE_FLAG_CATEGORIES[number];

export const FEATURE_FLAG_REGISTRY = {
  contracts_opening_balance: {
    default: true,
    category: 'contracts',
    i18nKey: 'contractsOpeningBalance',
    revalidatePaths: (locale: string) => [`/${locale}/contracts`, `/${locale}/import`],
  },
  contracts_multi_line: {
    default: true,
    category: 'contracts',
    i18nKey: 'contractsMultiLine',
    revalidatePaths: (locale: string) => [`/${locale}/contracts`],
  },
  odoo_import_center: {
    default: true,
    category: 'odoo',
    i18nKey: 'odooImportCenter',
    revalidatePaths: (locale: string) => [`/${locale}/import`, `/${locale}/invoices`, `/${locale}/contracts`],
    navHrefs: [] as string[],
  },
  units_create_odoo_product: {
    default: true,
    category: 'odoo',
    i18nKey: 'unitsCreateOdooProduct',
    revalidatePaths: (locale: string) => [`/${locale}/units`],
  },
  units_link_odoo_product: {
    default: true,
    category: 'odoo',
    i18nKey: 'unitsLinkOdooProduct',
    revalidatePaths: (locale: string) => [`/${locale}/units`],
  },
  units_odoo_catalog_button: {
    default: true,
    category: 'odoo',
    i18nKey: 'unitsOdooCatalogButton',
    revalidatePaths: (locale: string) => [`/${locale}/units`],
  },
  odoo_service_catalog_button: {
    default: true,
    category: 'odoo',
    i18nKey: 'odooServiceCatalogButton',
    revalidatePaths: (locale: string) => [`/${locale}/units`],
  },
  odoo_invoices_documents: {
    default: true,
    category: 'odoo',
    i18nKey: 'odooInvoicesDocuments',
    revalidatePaths: (locale: string) => [`/${locale}/invoices`, `/${locale}/settings`],
  },
  odoo_invoice_manual_send: {
    default: true,
    category: 'odoo',
    i18nKey: 'odooInvoiceManualSend',
    revalidatePaths: (locale: string) => [
      `/${locale}/invoices`,
      `/${locale}/due-this-month`,
      `/${locale}/partial-payments`,
      `/${locale}/fully-paid`,
      `/${locale}/settings`,
    ],
  },
  import_excel_contracts: {
    default: true,
    category: 'imports',
    i18nKey: 'importExcelContracts',
    revalidatePaths: (locale: string) => [`/${locale}/import`, `/${locale}/contracts`],
  },
  reports_operational: {
    default: true,
    category: 'reports',
    i18nKey: 'reportsOperational',
    revalidatePaths: (locale: string) => [
      `/${locale}/reports/debt-aging`,
      `/${locale}/reports/location-statement`,
    ],
    navHrefs: ['/reports/debt-aging', '/reports/location-statement'],
  },
  invoices_payment_status_pages: {
    default: true,
    category: 'operations',
    i18nKey: 'invoicesPaymentStatusPages',
    revalidatePaths: (locale: string) => [
      `/${locale}/partial-payments`,
      `/${locale}/fully-paid`,
      `/${locale}/dashboard`,
    ],
    navHrefs: ['/partial-payments', '/fully-paid'],
  },
  master_data_mutations: {
    default: true,
    category: 'operations',
    i18nKey: 'masterDataMutations',
    revalidatePaths: (locale: string) => [
      `/${locale}/units`,
      `/${locale}/locations`,
      `/${locale}/import`,
    ],
  },
  admin_experimental: {
    default: true,
    category: 'admin',
    i18nKey: 'adminExperimental',
    revalidatePaths: (locale: string) => [`/${locale}/settings`],
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_REGISTRY;
export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAG_REGISTRY) as FeatureFlagKey[];

export const FEATURE_FLAG_DEFAULTS = Object.fromEntries(
  FEATURE_FLAG_KEYS.map((key) => [key, FEATURE_FLAG_REGISTRY[key].default]),
) as FeatureFlags;

export function featureFlagSettingKey(key: FeatureFlagKey) {
  return `feature_flag.${key}`;
}

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return value in FEATURE_FLAG_REGISTRY;
}

export function isFeatureEnabled(flags: FeatureFlags, key: FeatureFlagKey) {
  return flags[key] === true;
}

export function resolveFeatureFlags(settings: Setting[]): FeatureFlags {
  const flags = { ...FEATURE_FLAG_DEFAULTS };

  for (const key of FEATURE_FLAG_KEYS) {
    const value = settings.find((setting) => setting.key === featureFlagSettingKey(key))?.value;
    if (typeof value === 'boolean') flags[key] = value;
  }

  return flags;
}

export function featureDisabledResult() {
  return {
    success: false as const,
    error: 'featureDisabled' as const,
    errorCode: 'FEATURE_DISABLED' as const,
  };
}

export type FeatureDisabledResult = ReturnType<typeof featureDisabledResult>;

export function isFeatureDisabledResult(result: unknown): result is FeatureDisabledResult {
  return Boolean(
    result
    && typeof result === 'object'
    && 'errorCode' in result
    && (result as { errorCode?: string }).errorCode === 'FEATURE_DISABLED',
  );
}

export function revalidatePathsForFlag(locale: string, key: FeatureFlagKey) {
  return FEATURE_FLAG_REGISTRY[key].revalidatePaths(locale);
}

export function getFeatureFlagsByCategory() {
  return FEATURE_FLAG_CATEGORIES.map((category) => ({
    category,
    flags: FEATURE_FLAG_KEYS.filter((key) => FEATURE_FLAG_REGISTRY[key].category === category),
  })).filter((group) => group.flags.length > 0);
}
