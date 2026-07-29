import { createClient } from '@/lib/supabase/server';
import type { Setting, ImportLog, OdooSyncLog, OdooSyncStatus } from '@/types/database';
import type { LogContext } from '@/lib/observability';

function isMissingOdooLogTable(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'PGRST205'
  );
}

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

  async findByKeys(keys: string[], ctx: LogContext): Promise<Setting[]> {
    if (keys.length === 0) return [];
    const supabase = await createClient();
    const { data, error } = await supabase.from('settings').select('*').in('key', keys);
    if (error) throw error;
    return data ?? [];
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

export const odooSyncLogsRepository = {
  async create(input: {
    action: string;
    entity_type: string;
    entity_id?: string | null;
    status: OdooSyncStatus;
    message?: string | null;
    payload?: Record<string, unknown> | null;
    created_by?: string | null;
  }, ctx: LogContext): Promise<OdooSyncLog> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_sync_logs')
      .insert({
        action: input.action,
        entity_type: input.entity_type,
        entity_id: input.entity_id ?? null,
        status: input.status,
        message: input.message ?? null,
        payload: input.payload ?? null,
        created_by: input.created_by ?? null,
      })
      .select('*')
      .single();
    if (isMissingOdooLogTable(error)) {
      return {
        id: 'missing-odoo-sync-logs',
        action: input.action,
        entity_type: input.entity_type,
        entity_id: input.entity_id ?? null,
        status: input.status,
        message: input.message ?? null,
        payload: input.payload ?? null,
        created_by: input.created_by ?? null,
        created_at: new Date().toISOString(),
      };
    }
    if (error) throw error;
    return data;
  },

  async findRecent(ctx: LogContext, limit = 25): Promise<OdooSyncLog[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('odoo_sync_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (isMissingOdooLogTable(error)) return [];
    if (error) throw error;
    return data ?? [];
  },
};
