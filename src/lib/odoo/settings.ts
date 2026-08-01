import 'server-only';

import crypto from 'node:crypto';
import { settingsRepository } from '@/lib/repositories/settings';
import type { ContractTaxMode, Setting } from '@/types/database';
import type { LogContext } from '@/lib/observability';
import {
  isOdooInvoiceSendVisibleStatus,
  type OdooInvoiceSendVisibleStatus,
} from '@/lib/odoo/invoice-send-settings';

export const ODOO_SETTING_KEY = 'odoo_integration';

export {
  ODOO_INVOICE_SEND_VISIBLE_STATUSES,
  isOdooInvoiceSendVisibleStatus,
  type OdooInvoiceSendVisibleStatus,
} from '@/lib/odoo/invoice-send-settings';

export interface OdooSettings {
  enabled: boolean;
  url: string;
  database: string;
  username: string;
  apiKey: string;
  companyId: number | null;
  journalId: number | null;
  vatTaxId: number | null;
  zeroRatedTaxId: number | null;
  incomeAccountId: number | null;
  productCategoryId: number | null;
  additionalProductCategoryIds: number[];
  serviceCategoryId: number | null;
  vatRate: number;
  zeroRatedTaxRate: number;
  defaultTaxMode: ContractTaxMode;
  startDateField: string;
  endDateField: string;
  /** Local invoice status at which the Send to Odoo button is shown. */
  invoiceSendVisibleStatus: OdooInvoiceSendVisibleStatus;
}

export type PublicOdooSettings = Omit<OdooSettings, 'apiKey'> & {
  hasApiKey: boolean;
};

const DEFAULT_ODOO_SETTINGS: OdooSettings = {
  enabled: false,
  url: '',
  database: '',
  username: '',
  apiKey: '',
  companyId: null,
  journalId: null,
  vatTaxId: null,
  zeroRatedTaxId: null,
  incomeAccountId: null,
  productCategoryId: null,
  additionalProductCategoryIds: [],
  serviceCategoryId: null,
  vatRate: 15,
  zeroRatedTaxRate: 0,
  defaultTaxMode: 'taxable',
  startDateField: 'deferred_start_date',
  endDateField: 'deferred_end_date',
  invoiceSendVisibleStatus: 'invoice_issued',
};

function encryptionKey() {
  // Prefer dedicated secret. Never fall back to service role key for encryption.
  const secret = process.env.ODOO_SETTINGS_SECRET || process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!secret?.trim()) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(value: string) {
  if (!value) return '';
  const key = encryptionKey();
  if (!key) {
    throw new Error('ODOO_SETTINGS_SECRET is required to encrypt Odoo credentials');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptSecret(value: string) {
  if (!value || !value.startsWith('enc:v1:')) return value;
  const key = encryptionKey();
  if (!key) return '';
  const raw = Buffer.from(value.slice('enc:v1:'.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(Number)
    .filter((number) => Number.isSafeInteger(number) && number > 0))];
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

function normalize(raw: unknown): OdooSettings {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const encryptedApiKey = typeof value.apiKey === 'string' ? value.apiKey : '';
  const productCategoryId = asNumber(value.productCategoryId);
  const additionalProductCategoryIds = asNumberArray(value.additionalProductCategoryIds)
    .filter((id) => id !== productCategoryId);
  return {
    enabled: Boolean(value.enabled),
    url: normalizeUrl(typeof value.url === 'string' ? value.url : ''),
    database: typeof value.database === 'string' ? value.database.trim() : '',
    username: typeof value.username === 'string' ? value.username.trim() : '',
    apiKey: decryptSecret(encryptedApiKey),
    companyId: asNumber(value.companyId),
    journalId: asNumber(value.journalId),
    vatTaxId: asNumber(value.vatTaxId),
    zeroRatedTaxId: asNumber(value.zeroRatedTaxId),
    incomeAccountId: asNumber(value.incomeAccountId),
    productCategoryId,
    additionalProductCategoryIds,
    serviceCategoryId: asNumber(value.serviceCategoryId),
    vatRate: Math.min(100, Math.max(0, asNumber(value.vatRate) ?? 15)),
    zeroRatedTaxRate: Math.min(100, Math.max(0, asNumber(value.zeroRatedTaxRate) ?? 0)),
    defaultTaxMode: value.defaultTaxMode === 'non_taxable' ? 'non_taxable' : 'taxable',
    startDateField: typeof value.startDateField === 'string' && value.startDateField.trim()
      ? value.startDateField.trim()
      : DEFAULT_ODOO_SETTINGS.startDateField,
    endDateField: typeof value.endDateField === 'string' && value.endDateField.trim()
      ? value.endDateField.trim()
      : DEFAULT_ODOO_SETTINGS.endDateField,
    invoiceSendVisibleStatus: isOdooInvoiceSendVisibleStatus(value.invoiceSendVisibleStatus)
      ? value.invoiceSendVisibleStatus
      : DEFAULT_ODOO_SETTINGS.invoiceSendVisibleStatus,
  };
}

export function getRentalProductCategoryIds(settings: Pick<OdooSettings, 'productCategoryId' | 'additionalProductCategoryIds'>) {
  return [...new Set([
    ...(settings.productCategoryId ? [settings.productCategoryId] : []),
    ...settings.additionalProductCategoryIds,
  ])];
}

export function toPublicOdooSettings(settings: OdooSettings): PublicOdooSettings {
  const { apiKey, ...publicSettings } = settings;
  return { ...publicSettings, hasApiKey: Boolean(apiKey) };
}

export async function getOdooSettings(ctx: LogContext): Promise<OdooSettings> {
  const setting = await settingsRepository.findByKey(ODOO_SETTING_KEY, ctx);
  if (!setting) return DEFAULT_ODOO_SETTINGS;
  return normalize(setting.value);
}

export async function getPublicOdooSettings(ctx: LogContext): Promise<PublicOdooSettings> {
  return toPublicOdooSettings(await getOdooSettings(ctx));
}

export async function saveOdooSettings(input: Partial<OdooSettings> & { apiKey?: string }, userId: string, ctx: LogContext): Promise<Setting> {
  const current = await getOdooSettings(ctx);
  const productCategoryId = input.productCategoryId === undefined
    ? current.productCategoryId
    : asNumber(input.productCategoryId);
  const additionalProductCategoryIds = asNumberArray(
    input.additionalProductCategoryIds ?? current.additionalProductCategoryIds,
  ).filter((id) => id !== productCategoryId);
  const next: OdooSettings = {
    ...current,
    ...input,
    productCategoryId,
    additionalProductCategoryIds,
    url: normalizeUrl(input.url ?? current.url),
    apiKey: input.apiKey ? input.apiKey : current.apiKey,
    vatTaxId: input.vatTaxId === undefined ? current.vatTaxId : asNumber(input.vatTaxId),
    zeroRatedTaxId: input.zeroRatedTaxId === undefined ? current.zeroRatedTaxId : asNumber(input.zeroRatedTaxId),
    vatRate: input.vatRate === undefined
      ? current.vatRate
      : Math.min(100, Math.max(0, asNumber(input.vatRate) ?? current.vatRate)),
    zeroRatedTaxRate: input.zeroRatedTaxRate === undefined
      ? current.zeroRatedTaxRate
      : Math.min(100, Math.max(0, asNumber(input.zeroRatedTaxRate) ?? current.zeroRatedTaxRate)),
    defaultTaxMode: input.defaultTaxMode === 'non_taxable' ? 'non_taxable' : 'taxable',
    startDateField: input.startDateField?.trim() || current.startDateField,
    endDateField: input.endDateField?.trim() || current.endDateField,
    invoiceSendVisibleStatus: isOdooInvoiceSendVisibleStatus(input.invoiceSendVisibleStatus)
      ? input.invoiceSendVisibleStatus
      : current.invoiceSendVisibleStatus,
  };
  return settingsRepository.upsert(ODOO_SETTING_KEY, {
    ...next,
    apiKey: encryptSecret(next.apiKey),
  }, userId, ctx);
}

export function assertOdooConfigured(settings: OdooSettings) {
  if (!settings.enabled) throw new Error('Odoo integration is disabled');
  if (!settings.url || !settings.database || !settings.username || !settings.apiKey) {
    throw new Error('Odoo URL, database, username, and API key are required');
  }
}
