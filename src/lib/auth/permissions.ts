export const PERMISSION_KEYS = [
  'locations.view',
  'locations.create',
  'locations.update',
  'locations.delete',
  'units.view',
  'units.create',
  'units.update',
  'units.delete',
  'tenants.view',
  'tenants.create',
  'tenants.update',
  'tenants.delete',
  'contracts.view',
  'contracts.create',
  'contracts.update',
  'contracts.delete',
  'invoices.view',
  'invoices.create',
  'invoices.update',
  'invoices.delete',
  'payments.view',
  'payments.record',
  'reports.view',
  'reports.export',
  'imports.manage',
  'odoo.manage',
  'users.manage',
  'roles.manage',
  'settings.manage',
  'feature_flags.manage',
  'audit.view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionCategory =
  | 'locations'
  | 'units'
  | 'tenants'
  | 'contracts'
  | 'invoices'
  | 'payments'
  | 'reports'
  | 'imports'
  | 'odoo'
  | 'users'
  | 'roles'
  | 'settings'
  | 'feature_flags'
  | 'audit';

export interface PermissionDefinition {
  key: PermissionKey;
  category: PermissionCategory;
  requires?: PermissionKey[];
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: 'locations.view', category: 'locations' },
  { key: 'locations.create', category: 'locations', requires: ['locations.view'] },
  { key: 'locations.update', category: 'locations', requires: ['locations.view'] },
  { key: 'locations.delete', category: 'locations', requires: ['locations.view'] },
  { key: 'units.view', category: 'units' },
  { key: 'units.create', category: 'units', requires: ['units.view'] },
  { key: 'units.update', category: 'units', requires: ['units.view'] },
  { key: 'units.delete', category: 'units', requires: ['units.view'] },
  { key: 'tenants.view', category: 'tenants' },
  { key: 'tenants.create', category: 'tenants', requires: ['tenants.view'] },
  { key: 'tenants.update', category: 'tenants', requires: ['tenants.view'] },
  { key: 'tenants.delete', category: 'tenants', requires: ['tenants.view'] },
  { key: 'contracts.view', category: 'contracts' },
  { key: 'contracts.create', category: 'contracts', requires: ['contracts.view'] },
  { key: 'contracts.update', category: 'contracts', requires: ['contracts.view'] },
  { key: 'contracts.delete', category: 'contracts', requires: ['contracts.view'] },
  { key: 'invoices.view', category: 'invoices' },
  { key: 'invoices.create', category: 'invoices', requires: ['invoices.view'] },
  { key: 'invoices.update', category: 'invoices', requires: ['invoices.view'] },
  { key: 'invoices.delete', category: 'invoices', requires: ['invoices.view'] },
  { key: 'payments.view', category: 'payments' },
  { key: 'payments.record', category: 'payments', requires: ['payments.view'] },
  { key: 'reports.view', category: 'reports' },
  { key: 'reports.export', category: 'reports', requires: ['reports.view'] },
  { key: 'imports.manage', category: 'imports' },
  { key: 'odoo.manage', category: 'odoo' },
  { key: 'users.manage', category: 'users' },
  { key: 'roles.manage', category: 'roles' },
  { key: 'settings.manage', category: 'settings' },
  { key: 'feature_flags.manage', category: 'feature_flags' },
  { key: 'audit.view', category: 'audit' },
];

const PERMISSION_SET = new Set<string>(PERMISSION_KEYS);

export const SYSTEM_ROLE_SLUGS = {
  adminEditor: 'admin_editor',
  viewer: 'viewer',
} as const;

export const VIEWER_PERMISSION_KEYS: PermissionKey[] = [
  'locations.view',
  'units.view',
  'tenants.view',
  'contracts.view',
  'invoices.view',
  'payments.view',
  'reports.view',
];

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_SET.has(value);
}

export function expandPermissionDependencies(keys: readonly string[]): PermissionKey[] {
  const selected = new Set<PermissionKey>();

  for (const key of keys) {
    if (!isPermissionKey(key)) continue;
    selected.add(key);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of PERMISSION_CATALOG) {
      if (!selected.has(definition.key) || !definition.requires) continue;
      for (const required of definition.requires) {
        if (!selected.has(required)) {
          selected.add(required);
          changed = true;
        }
      }
    }
  }

  return PERMISSION_KEYS.filter((key) => selected.has(key));
}

export function hasPermission(
  auth: { permissions?: readonly string[] | null } | null | undefined,
  key: PermissionKey,
): boolean {
  return Boolean(auth?.permissions?.includes(key));
}

export function hasAnyPermission(
  auth: { permissions?: readonly string[] | null } | null | undefined,
  keys: readonly PermissionKey[],
): boolean {
  return keys.some((key) => hasPermission(auth, key));
}

export function canMutateModule(
  auth: { permissions?: readonly string[] | null } | null | undefined,
  module: 'locations' | 'units' | 'tenants' | 'contracts' | 'invoices',
): boolean {
  return hasAnyPermission(auth, [
    `${module}.create`,
    `${module}.update`,
    `${module}.delete`,
  ] as PermissionKey[]);
}

export const NAV_PERMISSIONS: Record<string, PermissionKey | null> = {
  '/dashboard': null,
  '/locations': 'locations.view',
  '/units': 'units.view',
  '/contracts': 'contracts.view',
  '/due-this-month': 'invoices.view',
  '/invoices': 'invoices.view',
  '/partial-payments': 'invoices.view',
  '/fully-paid': 'invoices.view',
  '/payments': 'payments.view',
  '/reports/debt-aging': 'reports.view',
  '/reports/location-statement': 'reports.view',
  '/import': 'imports.manage',
  '/users': 'users.manage',
  '/roles': 'roles.manage',
  '/audit-logs': 'audit.view',
  '/feature-flags': 'feature_flags.manage',
  '/settings': 'settings.manage',
};
