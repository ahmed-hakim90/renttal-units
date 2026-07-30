import { createClient } from '@/lib/supabase/server';
import { usersRepository } from '@/lib/repositories/users';
import { rolesRepository } from '@/lib/repositories/roles';
import {
  hasAnyPermission,
  hasPermission as checkPermission,
  isPermissionKey,
  type PermissionKey,
} from '@/lib/auth/permissions';
import type { AuthContext } from '@/types/database';
import { redirect } from '@/lib/i18n/navigation';
import type { LogContext } from '@/lib/observability';

export async function getAuthContext(ctx: LogContext = {}): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await usersRepository.findById(user.id, ctx);
  if (!profile?.role_id) return null;

  const role = await rolesRepository.findById(profile.role_id, ctx);
  if (!role) return null;

  const permissions = (role.permission_keys ?? []).filter(isPermissionKey);

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    role: profile.role,
    roleId: role.id,
    roleSlug: role.slug,
    roleNameEn: role.name_en,
    roleNameAr: role.name_ar,
    permissions,
    isAdminEditor: Boolean(role.is_system_owner),
    mustChangePassword: Boolean(profile.must_change_password),
  };
}

export async function requireAuth(locale: string, ctx: LogContext = {}): Promise<AuthContext> {
  const auth = await getAuthContext(ctx);
  if (!auth) redirect({ href: '/login', locale });
  return auth!;
}

export async function requirePermission(
  locale: string,
  permission: PermissionKey,
  ctx: LogContext = {},
): Promise<AuthContext> {
  const auth = await requireAuth(locale, ctx);
  if (!checkPermission(auth, permission)) {
    redirect({ href: '/dashboard', locale });
  }
  return auth;
}

export async function requireAnyPermission(
  locale: string,
  permissions: readonly PermissionKey[],
  ctx: LogContext = {},
): Promise<AuthContext> {
  const auth = await requireAuth(locale, ctx);
  if (!hasAnyPermission(auth, permissions)) {
    redirect({ href: '/dashboard', locale });
  }
  return auth;
}

/** Legacy system-owner gate. Prefer requirePermission for scoped authorization. */
export async function requireAdminEditor(locale: string, ctx: LogContext = {}): Promise<AuthContext> {
  const auth = await requireAuth(locale, ctx);
  if (!auth.isAdminEditor) redirect({ href: '/dashboard', locale });
  return auth;
}

export function authHasPermission(auth: AuthContext | null | undefined, permission: PermissionKey) {
  return checkPermission(auth, permission);
}
