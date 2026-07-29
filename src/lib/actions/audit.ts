'use server';

import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { auditLogReadRepository } from '@/lib/repositories/audit-logs';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@/lib/audit/catalog';
import { getCorrelationId } from '@/lib/observability/correlation-id';

const auditFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  action: z.enum(AUDIT_ACTIONS).optional(),
  entity_type: z.enum(AUDIT_ENTITY_TYPES).optional(),
  actor_id: z.string().uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).strict();

export type AuditLogFilters = z.input<typeof auditFiltersSchema>;

export async function getAuditLogs(locale: string, filters: AuditLogFilters = {}) {
  const ctx = { correlation_id: await getCorrelationId() };
  await requirePermission(locale, 'audit.view', ctx);
  const parsed = auditFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return auditLogReadRepository.findPage({ page: 1, pageSize: 25 });
  }

  return auditLogReadRepository.findPage({
    page: parsed.data.page,
    pageSize: 25,
    action: parsed.data.action,
    entityType: parsed.data.entity_type,
    actorId: parsed.data.actor_id,
    from: parsed.data.from,
    to: parsed.data.to,
  });
}

export async function getUserAuditLogs(locale: string, userId: string) {
  const ctx = { correlation_id: await getCorrelationId() };
  await requirePermission(locale, 'audit.view', ctx);
  const parsedId = z.string().uuid().safeParse(userId);
  if (!parsedId.success) return [];
  return auditLogReadRepository.findForProfile(parsedId.data);
}

