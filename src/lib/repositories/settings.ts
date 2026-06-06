import { createClient } from '@/lib/supabase/server';
import type { Setting, ImportLog } from '@/types/database';
import type { LogContext } from '@/lib/observability';

export const settingsRepository = {
  async findAll(ctx: LogContext): Promise<Setting[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('settings').select('*').order('key');
    if (error) throw error;
    return data ?? [];
  },

  async findByKey(key: string, ctx: LogContext): Promise<Setting | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('settings').select('*').eq('key', key).maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(key: string, value: unknown, updatedBy: string, ctx: LogContext): Promise<Setting> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const importLogsRepository = {
  async create(input: Omit<ImportLog, 'id' | 'created_at'>, ctx: LogContext): Promise<ImportLog> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('import_logs').insert(input).select().single();
    if (error) throw error;
    return data;
  },

  async findAll(ctx: LogContext): Promise<ImportLog[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('import_logs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

export const auditLogsRepository = {
  async create(input: {
    user_id: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    old_values?: Record<string, unknown>;
    new_values?: Record<string, unknown>;
  }, ctx: LogContext): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('audit_logs').insert(input);
    if (error) throw error;
  },

  async findByEntity(entityType: string, entityId: string, ctx: LogContext) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
