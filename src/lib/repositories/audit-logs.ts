import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { buildAuditChanges } from '@/lib/audit/format-audit-log';
import type { AuditLog, AuditLogPage, AuditLogReadModel } from '@/types/database';

const AUDIT_LOG_SELECT = `
  id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_values,
  new_values,
  created_at,
  actor:profiles!audit_logs_user_id_fkey(
    full_name,
    email,
    assigned_role:roles!role_id(is_system_owner)
  )
`;

type AuditActorRow = {
  full_name: string | null;
  email: string;
  assigned_role:
    | { is_system_owner: boolean }
    | Array<{ is_system_owner: boolean }>
    | null;
};

type AuditLogRow = AuditLog & {
  actor: AuditActorRow | AuditActorRow[] | null;
};

function toReadModel(row: AuditLogRow): AuditLogReadModel {
  const actorRow = Array.isArray(row.actor) ? row.actor[0] ?? null : row.actor;
  const assignedRole = actorRow
    ? (Array.isArray(actorRow.assigned_role)
      ? actorRow.assigned_role[0] ?? null
      : actorRow.assigned_role)
    : null;
  const actor = actorRow && !assignedRole?.is_system_owner
    ? { full_name: actorRow.full_name, email: actorRow.email }
    : null;
  const log: AuditLog = {
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    old_values: row.old_values,
    new_values: row.new_values,
    created_at: row.created_at,
  };

  return { ...log, actor, changes: buildAuditChanges(log) };
}

async function findProtectedProfileIds(supabase: ReturnType<typeof createAdminClient>) {
  const { data: ownerRoles, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('is_system_owner', true);
  if (roleError) throw roleError;
  const roleIds = (ownerRoles ?? []).map((role) => role.id);
  if (roleIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .in('role_id', roleIds);
  if (profileError) throw profileError;
  return (profiles ?? []).map((profile) => profile.id);
}

export const auditLogReadRepository = {
  async findPage(input: {
    page: number;
    pageSize: number;
    action?: string;
    entityType?: string;
    actorId?: string;
    from?: string;
    to?: string;
  }): Promise<AuditLogPage> {
    const supabase = createAdminClient();
    const protectedProfileIds = await findProtectedProfileIds(supabase);
    const fromIndex = (input.page - 1) * input.pageSize;
    const toIndex = fromIndex + input.pageSize - 1;
    let query = supabase
      .from('audit_logs')
      .select(AUDIT_LOG_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(fromIndex, toIndex);

    if (input.action) query = query.eq('action', input.action);
    if (input.entityType) query = query.eq('entity_type', input.entityType);
    if (input.actorId) query = query.eq('user_id', input.actorId);
    if (input.from) query = query.gte('created_at', input.from);
    if (input.to) query = query.lte('created_at', input.to);
    if (protectedProfileIds.length > 0) {
      query = query.or(
        `entity_id.is.null,entity_id.not.in.(${protectedProfileIds.join(',')})`,
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const total = count ?? 0;

    return {
      items: ((data ?? []) as unknown as AuditLogRow[]).map(toReadModel),
      page: input.page,
      page_size: input.pageSize,
      total,
      page_count: Math.max(1, Math.ceil(total / input.pageSize)),
    };
  },

  async findForProfile(profileId: string, limit = 20): Promise<AuditLogReadModel[]> {
    const supabase = createAdminClient();
    const protectedProfileIds = await findProtectedProfileIds(supabase);
    if (protectedProfileIds.includes(profileId)) return [];
    const { data, error } = await supabase
      .from('audit_logs')
      .select(AUDIT_LOG_SELECT)
      .eq('entity_type', 'profile')
      .eq('entity_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as unknown as AuditLogRow[]).map(toReadModel);
  },
};

