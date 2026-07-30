import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_REGISTRY,
  featureDisabledResult,
  getFeatureFlagsByCategory,
  isFeatureEnabled,
  isFeatureFlagKey,
  resolveFeatureFlags,
} from '../src/lib/features.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('registers all planned feature flags with enabled defaults', () => {
  assert.equal(FEATURE_FLAG_KEYS.length, 13);
  for (const key of FEATURE_FLAG_KEYS) {
    assert.equal(FEATURE_FLAG_DEFAULTS[key], true);
    assert.equal(FEATURE_FLAG_REGISTRY[key].default, true);
    assert.ok(FEATURE_FLAG_REGISTRY[key].i18nKey);
    assert.ok(FEATURE_FLAG_REGISTRY[key].category);
  }
});

test('keeps existing Odoo catalog button visible when no flag is saved', () => {
  assert.equal(resolveFeatureFlags([]).units_odoo_catalog_button, true);
  assert.equal(resolveFeatureFlags([]).odoo_service_catalog_button, true);
});

test('reads saved boolean feature flags', () => {
  const settings = [
    {
      id: 'setting-id',
      key: 'feature_flag.units_odoo_catalog_button',
      value: false,
      updated_by: null,
      updated_at: '2026-07-30T00:00:00.000Z',
    },
    {
      id: 'setting-id-2',
      key: 'feature_flag.contracts_opening_balance',
      value: false,
      updated_by: null,
      updated_at: '2026-07-30T00:00:00.000Z',
    },
  ];

  const flags = resolveFeatureFlags(settings);
  assert.equal(flags.units_odoo_catalog_button, false);
  assert.equal(flags.contracts_opening_balance, false);
});

test('ignores malformed feature flag values and uses the safe default', () => {
  const settings = [{
    id: 'setting-id',
    key: 'feature_flag.units_odoo_catalog_button',
    value: 'false',
    updated_by: null,
    updated_at: '2026-07-30T00:00:00.000Z',
  }];

  assert.equal(resolveFeatureFlags(settings).units_odoo_catalog_button, true);
});

test('allowlists only registry keys', () => {
  assert.equal(isFeatureFlagKey('units_odoo_catalog_button'), true);
  assert.equal(isFeatureFlagKey('unknown_flag'), false);
});

test('exposes a typed disabled result for server actions', () => {
  assert.deepEqual(featureDisabledResult(), {
    success: false,
    error: 'featureDisabled',
    errorCode: 'FEATURE_DISABLED',
  });
});

test('detects feature-disabled action results', async () => {
  const { isFeatureDisabledResult } = await import('../src/lib/features.ts');
  assert.equal(isFeatureDisabledResult(featureDisabledResult()), true);
  assert.equal(isFeatureDisabledResult({ success: true, data: {} }), false);
  assert.equal(isFeatureDisabledResult({ products: [] }), false);
});

test('groups flags by category without empty groups', () => {
  const groups = getFeatureFlagsByCategory();
  assert.ok(groups.length >= 5);
  assert.ok(groups.every((group) => group.flags.length > 0));
  assert.ok(isFeatureEnabled(FEATURE_FLAG_DEFAULTS, 'reports_operational'));
});

test('has matching Arabic and English translations for every registry i18n key', () => {
  const en = JSON.parse(readFileSync(join(root, 'src/messages/en/feature-flags.json'), 'utf8'));
  const ar = JSON.parse(readFileSync(join(root, 'src/messages/ar/feature-flags.json'), 'utf8'));

  for (const key of FEATURE_FLAG_KEYS) {
    const i18nKey = FEATURE_FLAG_REGISTRY[key].i18nKey;
    assert.equal(typeof en[i18nKey]?.title, 'string', `missing en title for ${i18nKey}`);
    assert.equal(typeof en[i18nKey]?.description, 'string', `missing en description for ${i18nKey}`);
    assert.equal(typeof ar[i18nKey]?.title, 'string', `missing ar title for ${i18nKey}`);
    assert.equal(typeof ar[i18nKey]?.description, 'string', `missing ar description for ${i18nKey}`);
  }

  for (const category of ['contracts', 'odoo', 'imports', 'reports', 'operations', 'admin']) {
    assert.equal(typeof en.categories[category], 'string');
    assert.equal(typeof ar.categories[category], 'string');
  }
});

test('blocks opening balance inputs when the flag is off', async () => {
  const {
    shouldBlockOpeningBalanceInput,
  } = await import('../src/lib/features/guards.ts');

  assert.equal(
    shouldBlockOpeningBalanceInput(false, { paid_through_date: '2026-01-01' }),
    true,
  );
  assert.equal(
    shouldBlockOpeningBalanceInput(true, { paid_through_date: '2026-01-01' }),
    false,
  );
  assert.equal(shouldBlockOpeningBalanceInput(false, {}), false);
});

test('blocks new multi-line creates while preserving existing multi-line contracts', async () => {
  const {
    shouldBlockMultiLineCreate,
    shouldBlockMultiLineUpdate,
  } = await import('../src/lib/features/guards.ts');

  const multi = [
    { line_type: 'rental' },
    { line_type: 'service' },
  ];
  const single = [{ line_type: 'rental' }];

  assert.equal(shouldBlockMultiLineCreate(false, multi), true);
  assert.equal(shouldBlockMultiLineCreate(false, single), false);
  assert.equal(shouldBlockMultiLineUpdate(false, multi, multi), false);
  assert.equal(shouldBlockMultiLineUpdate(false, multi, [...multi, { line_type: 'service' }]), true);
  assert.equal(shouldBlockMultiLineUpdate(false, single, multi), true);
  assert.equal(shouldBlockMultiLineUpdate(true, single, multi), false);
});

test('keeps local invoice issue available when Odoo documents are disabled', async () => {
  const { shouldSyncIssuedInvoiceToOdoo } = await import('../src/lib/features/guards.ts');
  assert.equal(shouldSyncIssuedInvoiceToOdoo(false), false);
  assert.equal(shouldSyncIssuedInvoiceToOdoo(true), true);
});
