import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('contract cancel writes an audit log after success', () => {
  const service = read('src/lib/services/contract-service.ts');
  assert.match(
    service,
    /await auditService\.log\(\s*auth,\s*'cancel',\s*'contract'/,
  );
});

test('invoice status pages use server pagination', () => {
  for (const page of [
    'src/app/[locale]/(dashboard)/invoices/page.tsx',
    'src/app/[locale]/(dashboard)/partial-payments/page.tsx',
    'src/app/[locale]/(dashboard)/fully-paid/page.tsx',
  ]) {
    const source = read(page);
    assert.match(source, /getInvoicesPage/);
    assert.match(source, /ListPagination/);
    assert.doesNotMatch(source, /getInvoices\(locale/);
  }
});

test('tenants management surface is wired end-to-end', () => {
  assert.match(read('src/app/[locale]/(dashboard)/tenants/page.tsx'), /TenantsManager/);
  assert.match(read('src/lib/actions/tenants.ts'), /requirePermission/);
  assert.match(read('src/components/layout/sidebar.tsx'), /\/tenants/);
  assert.match(read('src/messages/en/tenants.json'), /"title"/);
  assert.match(read('src/messages/ar/tenants.json'), /"title"/);
});

test('user deactivate/reactivate is permission and owner guarded', () => {
  const admin = read('src/lib/actions/admin.ts');
  assert.match(admin, /export async function setUserActive/);
  assert.match(admin, /requirePermission\(locale, 'users\.manage'/);
  assert.match(admin, /cannotDeactivateSelf/);
  assert.match(admin, /cannotDeactivateLastOwner/);
  assert.match(admin, /'deactivate_user'|'reactivate_user'/);
});

test('unit detail exposes an edit shortcut that opens the units editor', () => {
  assert.match(read('src/components/units/unit-detail.tsx'), /\/units\?edit=/);
  assert.match(read('src/components/units/units-manager.tsx'), /editIdFromUrl/);
});

test('expiring and draft contract deep links are wired', () => {
  assert.match(read('src/lib/notifications/guards.ts'), /\/contracts\?expiring=30|expiring=30/);
  assert.match(read('src/app/[locale]/(dashboard)/contracts/page.tsx'), /expiring === '30'/);
  assert.match(read('src/lib/rental/contract-expiry.ts'), /isContractExpiringSoon/);
});

test('odoo document rows expose detail and needs_review resolution', () => {
  const table = read('src/components/invoices/odoo-documents-table.tsx');
  assert.match(table, /viewDetails/);
  assert.match(table, /resolveInImportCenter/);
  assert.match(table, /documentNeedsReview|mapping_status === 'needs_review'/);
});

test('import logs offer safe retry anchors without auto-replay', () => {
  const history = read('src/components/import/import-logs-history.tsx');
  assert.match(history, /retryTargetFor/);
  assert.match(history, /#import-units|#import-contracts|#odoo-import-center/);
  assert.doesNotMatch(history, /importUnits\(|importContracts\(/);
  const page = read('src/app/[locale]/(dashboard)/import/page.tsx');
  assert.match(page, /id="odoo-import-center"/);
  assert.match(page, /id="import-units"/);
  assert.match(page, /id="import-contracts"/);
});

test('payment reverse remains design-only until product approval', () => {
  const adr = read('docs/adr/2026-08-02-payment-reverse-design.md');
  assert.match(adr, /Status: Proposed/);
  assert.doesNotMatch(
    read('src/components/payments/payments-table.tsx'),
    /reversePayment|payments\.reverse/,
  );
});
