import { createClient } from '@/lib/supabase/server';
import type { Profile, UserRole } from '@/types/database';
import type { LogContext } from '@/lib/observability';

export const usersRepository = {
  async findAll(ctx: LogContext): Promise<Profile[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('profiles').select('*').order('email');
    if (error) throw error;
    return data ?? [];
  },

  async findById(id: string, ctx: LogContext): Promise<Profile | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async updateRole(id: string, role: UserRole, ctx: LogContext): Promise<Profile> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async upsertProfile(input: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    must_change_password?: boolean;
  }, ctx: LogContext): Promise<Profile> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .upsert(input, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
