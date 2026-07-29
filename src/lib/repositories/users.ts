import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/database';
import type { LogContext } from '@/lib/observability';

type ProfileRow = Profile & {
  assigned_role?: {
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
    is_system: boolean;
    is_system_owner: boolean;
  } | null;
};

export const usersRepository = {
  async findAll(ctx: LogContext): Promise<Profile[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*, assigned_role:roles!role_id!inner(id, slug, name_en, name_ar, is_system, is_system_owner)')
      .eq('assigned_role.is_system_owner', false)
      .order('email');
    if (error) throw error;
    return (data ?? []) as ProfileRow[];
  },

  async findById(id: string, ctx: LogContext): Promise<Profile | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*, assigned_role:roles!role_id(id, slug, name_en, name_ar, is_system, is_system_owner)')
      .eq('id', id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data as ProfileRow | null;
  },

  async countByRoleId(roleId: string, ctx: LogContext): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', roleId);
    if (error) throw error;
    return count ?? 0;
  },

  async updateRoleId(id: string, roleId: string, ctx: LogContext): Promise<Profile> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .update({ role_id: roleId })
      .eq('id', id)
      .select('*, assigned_role:roles!role_id(id, slug, name_en, name_ar, is_system, is_system_owner)')
      .single();
    if (error) throw error;
    return data as ProfileRow;
  },

  async updateEmail(id: string, email: string, ctx: LogContext): Promise<Profile> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .update({ email })
      .eq('id', id)
      .select('*, assigned_role:roles!role_id(id, slug, name_en, name_ar, is_system, is_system_owner)')
      .single();
    if (error) throw error;
    return data as ProfileRow;
  },

  async updateFullName(id: string, fullName: string, ctx: LogContext): Promise<Profile> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', id)
      .select('*, assigned_role:roles!role_id(id, slug, name_en, name_ar, is_system, is_system_owner)')
      .single();
    if (error) throw error;
    return data as ProfileRow;
  },

  async updateMustChangePassword(
    id: string,
    mustChangePassword: boolean,
    ctx: LogContext,
  ): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ must_change_password: mustChangePassword })
      .eq('id', id);
    if (error) throw error;
  },

  async upsertProfile(input: {
    id: string;
    email: string;
    full_name: string;
    role_id: string;
    must_change_password?: boolean;
  }, ctx: LogContext): Promise<Profile> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: input.id,
        email: input.email,
        full_name: input.full_name,
        role_id: input.role_id,
        must_change_password: input.must_change_password ?? false,
      }, { onConflict: 'id' })
      .select('*, assigned_role:roles!role_id(id, slug, name_en, name_ar, is_system, is_system_owner)')
      .single();
    if (error) throw error;
    return data as ProfileRow;
  },
};
