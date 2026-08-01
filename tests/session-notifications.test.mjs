import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildActionableNotifications,
  filterUnseenNotifications,
  getNotificationBadgeCount,
  isAllowedNotificationHref,
  isActionableNotificationKind,
  mergeSeenNotificationKinds,
  parseSeenNotificationKinds,
  serializeSeenNotificationKinds,
} from '../src/lib/notifications/guards.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const fullAccess = {
  canViewInvoices: true,
  canViewContracts: true,
  canManageOdoo: true,
  showPaymentStatusPages: true,
  odooDocumentsEnabled: true,
};

const fullCounts = {
  overdueCount: 2,
  dueCount: 3,
  awaitingPaymentCount: 7,
  partialCount: 4,
  draftCount: 5,
  expiringCount: 6,
  odooFailedCount: 1,
  odooNeedsReviewCount: 2,
};

test('builds prioritized actionable notifications from counts', () => {
  const notifications = buildActionableNotifications(fullCounts, fullAccess);
  assert.deepEqual(
    notifications.map((item) => item.kind),
    [
      'overdue_invoices',
      'odoo_sync_issues',
      'due_invoices',
      'awaiting_payment',
      'partial_payments',
      'draft_contracts',
      'expiring_contracts',
    ],
  );
  assert.equal(notifications[0]?.href, '/invoices');
  assert.equal(notifications[1]?.count, 3);
  assert.equal(notifications[1]?.failedCount, 1);
  assert.equal(notifications[1]?.needsReviewCount, 2);
  assert.equal(notifications.find((item) => item.kind === 'due_invoices')?.href, '/due-this-month');
  assert.equal(notifications.find((item) => item.kind === 'awaiting_payment')?.href, '/invoices');
  assert.equal(notifications.find((item) => item.kind === 'partial_payments')?.href, '/partial-payments');
  assert.equal(notifications.find((item) => item.kind === 'draft_contracts')?.href, '/contracts');
});

test('skips zero counts', () => {
  const notifications = buildActionableNotifications({
    overdueCount: 0,
    dueCount: 0,
    awaitingPaymentCount: 0,
    partialCount: 0,
    draftCount: 0,
    expiringCount: 0,
    odooFailedCount: 0,
    odooNeedsReviewCount: 0,
  }, fullAccess);
  assert.deepEqual(notifications, []);
});

test('hides invoice notifications without invoices.view', () => {
  const notifications = buildActionableNotifications(fullCounts, {
    ...fullAccess,
    canViewInvoices: false,
  });
  assert.ok(notifications.every((item) => (
    item.kind === 'draft_contracts'
    || item.kind === 'expiring_contracts'
    || item.kind === 'odoo_sync_issues'
  )));
  assert.equal(notifications.some((item) => item.kind === 'overdue_invoices'), false);
  assert.equal(notifications.some((item) => item.kind === 'due_invoices'), false);
  assert.equal(notifications.some((item) => item.kind === 'awaiting_payment'), false);
  assert.equal(notifications.some((item) => item.kind === 'partial_payments'), false);
});

test('hides contract notifications without contracts.view', () => {
  const notifications = buildActionableNotifications(fullCounts, {
    ...fullAccess,
    canViewContracts: false,
  });
  assert.equal(notifications.some((item) => item.kind === 'draft_contracts'), false);
  assert.equal(notifications.some((item) => item.kind === 'expiring_contracts'), false);
});

test('hides odoo notifications without manage permission or documents flag', () => {
  assert.equal(
    buildActionableNotifications(fullCounts, {
      ...fullAccess,
      canManageOdoo: false,
    }).some((item) => item.kind === 'odoo_sync_issues'),
    false,
  );
  assert.equal(
    buildActionableNotifications(fullCounts, {
      ...fullAccess,
      odooDocumentsEnabled: false,
    }).some((item) => item.kind === 'odoo_sync_issues'),
    false,
  );
});

test('hides partial payments when payment status pages are disabled', () => {
  const notifications = buildActionableNotifications(fullCounts, {
    ...fullAccess,
    showPaymentStatusPages: false,
  });
  assert.equal(notifications.some((item) => item.kind === 'partial_payments'), false);
});

test('allowlists only internal notification hrefs', () => {
  assert.equal(isAllowedNotificationHref('/invoices'), true);
  assert.equal(isAllowedNotificationHref('/due-this-month'), true);
  assert.equal(isAllowedNotificationHref('/partial-payments'), true);
  assert.equal(isAllowedNotificationHref('/contracts'), true);
  assert.equal(isAllowedNotificationHref('https://evil.example'), false);
  assert.equal(isAllowedNotificationHref('//evil.example'), false);
  assert.equal(isAllowedNotificationHref('javascript:alert(1)'), false);
  assert.equal(isAllowedNotificationHref('/settings'), false);
  assert.equal(isAllowedNotificationHref('/invoices/../settings'), false);
});

test('parses and merges session-seen kinds with allowlist', () => {
  assert.equal(isActionableNotificationKind('due_invoices'), true);
  assert.equal(isActionableNotificationKind('hack'), false);

  const seen = parseSeenNotificationKinds('due_invoices,hack,overdue_invoices');
  assert.deepEqual([...seen].sort(), ['due_invoices', 'overdue_invoices']);

  const merged = mergeSeenNotificationKinds(
    'due_invoices',
    ['partial_payments', 'hack'],
  );
  assert.equal(merged, 'due_invoices,partial_payments');
  assert.equal(serializeSeenNotificationKinds(['expiring_contracts', 'due_invoices']), 'due_invoices,expiring_contracts');
  assert.equal(isActionableNotificationKind('awaiting_payment'), true);
});

test('filters notifications already shown in the browser session', () => {
  const notifications = buildActionableNotifications(fullCounts, fullAccess);
  const remaining = filterUnseenNotifications(
    notifications,
    parseSeenNotificationKinds('overdue_invoices,odoo_sync_issues'),
  );
  assert.deepEqual(
    remaining.map((item) => item.kind),
    ['due_invoices', 'awaiting_payment', 'partial_payments', 'draft_contracts', 'expiring_contracts'],
  );
});

test('badge count uses active alert kinds and stays independent of session-seen filter', () => {
  const all = buildActionableNotifications(fullCounts, fullAccess);
  assert.equal(getNotificationBadgeCount(all), 7);

  const pending = filterUnseenNotifications(
    all,
    parseSeenNotificationKinds('overdue_invoices,odoo_sync_issues,due_invoices'),
  );
  assert.equal(getNotificationBadgeCount(all), 7);
  assert.equal(getNotificationBadgeCount(pending), 4);
});

test('keeps matching en/ar notification translation keys', () => {
  const en = JSON.parse(readFileSync(join(root, 'src/messages/en/notifications.json'), 'utf8'));
  const ar = JSON.parse(readFileSync(join(root, 'src/messages/ar/notifications.json'), 'utf8'));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  for (const key of ['bellLabel', 'badgeLabel', 'panelTitle', 'empty']) {
    assert.ok(en[key]);
    assert.ok(ar[key]);
  }
  for (const key of Object.keys(en)) {
    assert.equal(typeof en[key], 'string');
    assert.equal(typeof ar[key], 'string');
    assert.ok(String(ar[key]).length > 0);
  }
});

test('registers notifications messages in i18n request loader', () => {
  const source = readFileSync(join(root, 'src/lib/i18n/request.ts'), 'utf8');
  assert.match(source, /notifications\.json/);
  assert.match(source, /notifications:\s*notifications\.default/);
});

test('dashboard layout loads header and session notifications after auth', () => {
  const layout = readFileSync(join(root, 'src/app/[locale]/(dashboard)/layout.tsx'), 'utf8');
  assert.match(layout, /notificationService\.listActionable/);
  assert.match(layout, /notificationService\.listPendingForSession/);
  assert.match(layout, /SESSION_NOTIFICATIONS_COOKIE/);
  assert.match(layout, /headerNotifications/);
  assert.match(layout, /sessionNotifications/);

  const header = readFileSync(join(root, 'src/components/layout/header.tsx'), 'utf8');
  assert.match(header, /HeaderNotifications/);

  const bell = readFileSync(join(root, 'src/components/notifications/header-notifications.tsx'), 'utf8');
  assert.match(bell, /isAllowedNotificationHref/);
  assert.match(bell, /getNotificationBadgeCount/);
});
