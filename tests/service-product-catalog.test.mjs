import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('service product catalog migration is atomic and permission-scoped', () => {
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260730090206_odoo_service_product_catalog.sql'),
    'utf8',
  );

  assert.match(migration, /CREATE TABLE public\.odoo_service_products/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /public\.has_permission\('contracts\.create'\)/);
  assert.match(migration, /WITH CHECK \(public\.has_permission\('odoo\.manage'\)\)/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /ON CONFLICT \(odoo_product_id\) DO UPDATE/);
  assert.match(migration, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
});

test('service catalog sync is authorized and uses the configured category', () => {
  const actions = readFileSync(join(root, 'src/lib/actions/odoo.ts'), 'utf8');
  const service = readFileSync(join(root, 'src/lib/odoo/service.ts'), 'utf8');

  assert.match(actions, /syncOdooServiceProductCatalog/);
  assert.match(actions, /requirePermission\(locale, 'odoo\.manage'/);
  assert.match(actions, /requireFeatureEnabled\(ctx, 'odoo_service_catalog_button'\)/);
  assert.match(service, /settings\.serviceCategoryId/);
  assert.match(service, /searchProducts\(auth, '', ctx, 5_000, 'service'\)/);
  assert.match(service, /syncCategory\(/);
  assert.match(service, /sync_service_product_catalog/);
});

test('contract pages preload the local service catalog', () => {
  const newPage = readFileSync(
    join(root, 'src/app/[locale]/(dashboard)/contracts/new/page.tsx'),
    'utf8',
  );
  const editPage = readFileSync(
    join(root, 'src/app/[locale]/(dashboard)/contracts/[id]/edit/page.tsx'),
    'utf8',
  );
  const editor = readFileSync(join(root, 'src/components/contracts/contract-editor.tsx'), 'utf8');

  assert.match(newPage, /odooServiceProductsRepository\.findActive/);
  assert.match(editPage, /odooServiceProductsRepository\.findActive/);
  assert.match(editor, /initialServiceProducts/);
  assert.match(editor, /buildInitialServiceProductOptions\(initialServiceProducts, initialValues\)/);
});

test('service catalog UI translations exist in English and Arabic', () => {
  const en = JSON.parse(readFileSync(join(root, 'src/messages/en/units.json'), 'utf8'));
  const ar = JSON.parse(readFileSync(join(root, 'src/messages/ar/units.json'), 'utf8'));

  for (const key of [
    'serviceProducts',
    'serviceProductsTitle',
    'serviceProductsCategoryHint',
    'serviceCategoryNotConfigured',
    'syncServiceProducts',
    'serviceProductsSynced',
    'serviceProductSyncFailed',
    'noServiceProductsCached',
  ]) {
    assert.equal(typeof en[key], 'string', `missing en key ${key}`);
    assert.equal(typeof ar[key], 'string', `missing ar key ${key}`);
  }
});
