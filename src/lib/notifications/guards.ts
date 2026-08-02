/**
 * Pure notification builders and session-dedup helpers.
 * Audience and href rules are enforced here for unit tests;
 * callers still load counts only after auth.
 */

export const ACTIONABLE_NOTIFICATION_KINDS = [
  'overdue_invoices',
  'due_invoices',
  'awaiting_payment',
  'partial_payments',
  'draft_contracts',
  'expiring_contracts',
  'odoo_sync_issues',
] as const;

export type ActionableNotificationKind = (typeof ACTIONABLE_NOTIFICATION_KINDS)[number];

export const SESSION_NOTIFICATIONS_COOKIE = 'session_notif_seen';

const ALLOWED_NOTIFICATION_HREFS = new Set([
  '/due-this-month',
  '/partial-payments',
  '/invoices',
  '/contracts',
]);

const KIND_PRIORITY: Record<ActionableNotificationKind, number> = {
  overdue_invoices: 100,
  odoo_sync_issues: 90,
  due_invoices: 80,
  awaiting_payment: 75,
  partial_payments: 70,
  draft_contracts: 60,
  expiring_contracts: 50,
};

const KIND_SET = new Set<string>(ACTIONABLE_NOTIFICATION_KINDS);

export type ActionableNotification = {
  kind: ActionableNotificationKind;
  href: string;
  count: number;
  failedCount?: number;
  needsReviewCount?: number;
};

export type ActionableNotificationCounts = {
  overdueCount: number;
  dueCount: number;
  awaitingPaymentCount: number;
  partialCount: number;
  draftCount: number;
  expiringCount: number;
  odooFailedCount: number;
  odooNeedsReviewCount: number;
};

export type ActionableNotificationAccess = {
  canViewInvoices: boolean;
  canViewContracts: boolean;
  canManageOdoo: boolean;
  showPaymentStatusPages: boolean;
  odooDocumentsEnabled: boolean;
};

export function isActionableNotificationKind(value: string): value is ActionableNotificationKind {
  return KIND_SET.has(value);
}

export function isAllowedNotificationHref(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  if (href.includes('://') || href.toLowerCase().startsWith('javascript:')) return false;
  if (href.includes('..')) return false;
  const path = href.split('?')[0]?.split('#')[0] ?? '';
  return ALLOWED_NOTIFICATION_HREFS.has(path);
}

export function parseSeenNotificationKinds(raw: string | undefined | null): Set<ActionableNotificationKind> {
  const seen = new Set<ActionableNotificationKind>();
  if (!raw) return seen;

  for (const part of raw.split(',')) {
    const kind = part.trim();
    if (isActionableNotificationKind(kind)) seen.add(kind);
  }

  return seen;
}

export function serializeSeenNotificationKinds(
  kinds: Iterable<ActionableNotificationKind>,
): string {
  const unique = new Set<ActionableNotificationKind>();
  for (const kind of kinds) {
    if (isActionableNotificationKind(kind)) unique.add(kind);
  }
  return ACTIONABLE_NOTIFICATION_KINDS.filter((kind) => unique.has(kind)).join(',');
}

export function mergeSeenNotificationKinds(
  existingRaw: string | undefined | null,
  shown: Iterable<ActionableNotificationKind>,
): string {
  const merged = parseSeenNotificationKinds(existingRaw);
  for (const kind of shown) {
    if (isActionableNotificationKind(kind)) merged.add(kind);
  }
  return serializeSeenNotificationKinds(merged);
}

export function filterUnseenNotifications(
  notifications: ActionableNotification[],
  seenKinds: ReadonlySet<ActionableNotificationKind>,
): ActionableNotification[] {
  return notifications.filter((notification) => !seenKinds.has(notification.kind));
}

/** Badge count for the header bell: number of active alert kinds. */
export function getNotificationBadgeCount(notifications: ActionableNotification[]): number {
  return notifications.length;
}

export function buildActionableNotifications(
  counts: ActionableNotificationCounts,
  access: ActionableNotificationAccess,
): ActionableNotification[] {
  const notifications: ActionableNotification[] = [];

  if (access.canViewInvoices && counts.overdueCount > 0) {
    notifications.push({
      kind: 'overdue_invoices',
      href: '/invoices',
      count: counts.overdueCount,
    });
  }

  if (access.canViewInvoices && counts.dueCount > 0) {
    notifications.push({
      kind: 'due_invoices',
      href: '/due-this-month',
      count: counts.dueCount,
    });
  }

  if (access.canViewInvoices && counts.awaitingPaymentCount > 0) {
    notifications.push({
      kind: 'awaiting_payment',
      href: '/invoices',
      count: counts.awaitingPaymentCount,
    });
  }

  if (access.canViewInvoices && access.showPaymentStatusPages && counts.partialCount > 0) {
    notifications.push({
      kind: 'partial_payments',
      href: '/partial-payments',
      count: counts.partialCount,
    });
  }

  if (access.canViewContracts && counts.draftCount > 0) {
    notifications.push({
      kind: 'draft_contracts',
      href: '/contracts?status=draft',
      count: counts.draftCount,
    });
  }

  if (access.canViewContracts && counts.expiringCount > 0) {
    notifications.push({
      kind: 'expiring_contracts',
      href: '/contracts?expiring=30',
      count: counts.expiringCount,
    });
  }

  const odooIssueCount = counts.odooFailedCount + counts.odooNeedsReviewCount;
  if (
    access.canManageOdoo
    && access.odooDocumentsEnabled
    && odooIssueCount > 0
  ) {
    notifications.push({
      kind: 'odoo_sync_issues',
      href: '/invoices',
      count: odooIssueCount,
      failedCount: counts.odooFailedCount,
      needsReviewCount: counts.odooNeedsReviewCount,
    });
  }

  return notifications
    .filter((notification) => isAllowedNotificationHref(notification.href))
    .sort((a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind]);
}
