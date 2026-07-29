import { createClient } from '@/lib/supabase/server';
import type { RoleSummary } from '@/types/database';
import type { LogContext } from '@/lib/observability';
import { expandPermissionDependencies, isPermissionKey } from '@/lib/auth/permissions';

type RoleRow = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  is_system: boolean;
  is_system_owner: boolean;
  created_at: string;
  updated_at: string;
  role_permissions?: Array<{ permission_key: string }> | null;
};

function mapRole(row: RoleRow, userCount = 0): RoleSummary {
  return {
    id: row.id,
    slug: row.slug,
    name_en: row.name_en,
    name_ar: row.name_ar,
    description_en: row.description_en,
    description_ar: row.description_ar,
    is_system: row.is_system,
    is_system_owner: row.is_system_owner,
    created_at: row.created_at,
    updated_at: row.updated_at,
    permission_keys: (row.role_permissions ?? []).map((item) => item.permission_key),
    user_count: userCount,
  };
}

export const rolesRepository = {
  async findAll(ctx: LogContext): Promise<RoleSummary[]> {
    const supabase = await createClient();
    const [{ data: roles, error }, { data: profiles, error: profileError }] = await Promise.all([
      supabase
        .from('roles')
        .select('*, role_permissions(permission_key)')
        .order('is_system_owner', { ascending: false })
        .order('is_system', { ascending: false })
        .order('name_en'),
      supabase.from('profiles').select('role_id'),
    ]);

    if (error) throw error;
    if (profileError) throw profileError;

    const counts = new Map<string, number>();
    for (const profile of profiles ?? []) {
      if (!profile.role_id) continue;
      counts.set(profile.role_id, (counts.get(profile.role_id) ?? 0) + 1);
    }

    return (roles ?? []).map((role) => mapRole(role as RoleRow, counts.get(role.id) ?? 0));
  },

  async findById(id: string, ctx: LogContext): Promise<RoleSummary | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('roles')
      .select('*, role_permissions(permission_key)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return mapRole(data as RoleRow);
  },

  async findAssignable(ctx: LogContext & { excludeSystemOwner?: boolean }): Promise<RoleSummary[]> {
    const roles = await this.findAll(ctx);
    if (ctx.excludeSystemOwner) {
      return roles.filter((role) => !role.is_system_owner);
    }
    return roles;
  },

  async create(input: {
    name_en: string;
    name_ar: string;
    description_en?: string | null;
    description_ar?: string | null;
    permission_keys: string[];
  }, ctx: LogContext): Promise<RoleSummary> {
    const supabase = await createClient();
    const slugBase = input.name_en
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'custom_role';
    const slug = `${slugBase}_${crypto.randomUUID().slice(0, 8)}`;
    const permissions = expandPermissionDependencies(input.permission_keys);

    const { data: role, error } = await supabase
      .from('roles')
      .insert({
        slug,
        name_en: input.name_en.trim(),
        name_ar: input.name_ar.trim(),
        description_en: input.description_en?.trim() || null,
        description_ar: input.description_ar?.trim() || null,
        is_system: false,
        is_system_owner: false,
      })
      .select('*')
      .single();

    if (error) throw error;

    if (permissions.length > 0) {
      const { error: grantError } = await supabase.from('role_permissions').insert(
        permissions.map((permission_key) => ({
          role_id: role.id,
          permission_key,
        })),
      );
      if (grantError) throw grantError;
    }

    const created = await this.findById(role.id, ctx);
    if (!created) throw new Error('Role was created but could not be loaded');
    return created;
  },

  async update(id: string, input: {
    name_en: string;
    name_ar: string;
    description_en?: string | null;
    description_ar?: string | null;
    permission_keys: string[];
  }, ctx: LogContext): Promise<RoleSummary> {
    const supabase = await createClient();
    const existing = await this.findById(id, ctx);
    if (!existing) throw new Error('Role not found');
    if (existing.is_system_owner) throw new Error('System owner role cannot be modified');

    const permissions = expandPermissionDependencies(
      input.permission_keys.filter((key) => isPermissionKey(key)),
    );

    const { error } = await supabase
      .from('roles')
      .update({
        name_en: input.name_en.trim(),
        name_ar: input.name_ar.trim(),
        description_en: input.description_en?.trim() || null,
        description_ar: input.description_ar?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    const { error: replaceError } = await supabase.rpc('replace_role_permissions', {
      p_role_id: id,
      p_permission_keys: permissions,
    });
    if (replaceError) throw replaceError;

    const updated = await this.findById(id, ctx);
    if (!updated) throw new Error('Role was updated but could not be loaded');
    return updated;
  },

  async delete(id: string, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const existing = await this.findById(id, ctx);
    if (!existing) throw new Error('Role not found');
    if (existing.is_system) throw new Error('System roles cannot be deleted');
    if ((existing.user_count ?? 0) > 0) throw new Error('Role is assigned to users');

    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) throw error;
  },
};
