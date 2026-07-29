'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import {
  expandPermissionDependencies,
  isPermissionKey,
  PERMISSION_KEYS,
} from '@/lib/auth/permissions';
import { getCorrelationId } from '@/lib/observability/correlation-id';
import { rolesRepository } from '@/lib/repositories/roles';
import { auditService } from '@/lib/services/audit-service';

async function getCtx() {
  return { correlation_id: await getCorrelationId() };
}

function sanitizePermissionKeys(keys: string[]) {
  const valid = keys.filter(isPermissionKey);
  return expandPermissionDependencies(valid);
}

export async function getRoles(locale: string) {
  const auth = await requirePermission(locale, 'roles.manage', await getCtx());
  return rolesRepository.findAll({ ...await getCtx(), user_id: auth.userId, role: auth.role });
}

export async function getPermissionCatalog(locale: string) {
  await requirePermission(locale, 'roles.manage', await getCtx());
  return [...PERMISSION_KEYS];
}

export async function createRole(locale: string, data: {
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;
  permission_keys: string[];
}) {
  const auth = await requirePermission(locale, 'roles.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const nameEn = data.name_en.trim();
  const nameAr = data.name_ar.trim();
  if (!nameEn || !nameAr) return { success: false, error: 'Role name is required' };

  const permissionKeys = sanitizePermissionKeys(data.permission_keys ?? []);

  try {
    const role = await rolesRepository.create({
      name_en: nameEn,
      name_ar: nameAr,
      description_en: data.description_en,
      description_ar: data.description_ar,
      permission_keys: permissionKeys,
    }, ctx);

    await auditService.log(
      auth,
      'create_role',
      'role',
      role.id,
      null,
      {
        slug: role.slug,
        permission_keys: role.permission_keys,
      },
      ctx,
    );

    revalidatePath(`/${locale}/roles`);
    revalidatePath(`/${locale}/users`);
    return { success: true, data: role };
  } catch {
    return { success: false, error: 'Failed to create role' };
  }
}

export async function updateRole(locale: string, roleId: string, data: {
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;
  permission_keys: string[];
}) {
  const auth = await requirePermission(locale, 'roles.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const nameEn = data.name_en.trim();
  const nameAr = data.name_ar.trim();
  if (!nameEn || !nameAr) return { success: false, error: 'Role name is required' };

  const existing = await rolesRepository.findById(roleId, ctx);
  if (!existing) return { success: false, error: 'Role not found' };
  if (existing.is_system_owner) return { success: false, error: 'System owner role cannot be modified' };

  const permissionKeys = sanitizePermissionKeys(data.permission_keys ?? []);

  try {
    const role = await rolesRepository.update(roleId, {
      name_en: nameEn,
      name_ar: nameAr,
      description_en: data.description_en,
      description_ar: data.description_ar,
      permission_keys: permissionKeys,
    }, ctx);

    await auditService.log(
      auth,
      'update_role_permissions',
      'role',
      role.id,
      {
        permission_keys: existing.permission_keys,
        name_en: existing.name_en,
        name_ar: existing.name_ar,
      },
      {
        permission_keys: role.permission_keys,
        name_en: role.name_en,
        name_ar: role.name_ar,
      },
      ctx,
    );

    revalidatePath(`/${locale}/roles`);
    revalidatePath(`/${locale}/users`);
    return { success: true, data: role };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('System owner')) {
      return { success: false, error: 'System owner role cannot be modified' };
    }
    return { success: false, error: 'Failed to update role' };
  }
}

export async function deleteRole(locale: string, roleId: string) {
  const auth = await requirePermission(locale, 'roles.manage', await getCtx());
  const ctx = { ...(await getCtx()), user_id: auth.userId, role: auth.role };

  const existing = await rolesRepository.findById(roleId, ctx);
  if (!existing) return { success: false, error: 'Role not found' };

  try {
    await rolesRepository.delete(roleId, ctx);
    await auditService.log(
      auth,
      'delete_role',
      'role',
      roleId,
      {
        slug: existing.slug,
        permission_keys: existing.permission_keys,
      },
      null,
      ctx,
    );
    revalidatePath(`/${locale}/roles`);
    revalidatePath(`/${locale}/users`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('System roles')) {
      return { success: false, error: 'System roles cannot be deleted' };
    }
    if (message.includes('assigned to users')) {
      return { success: false, error: 'Role is assigned to users' };
    }
    return { success: false, error: 'Failed to delete role' };
  }
}
