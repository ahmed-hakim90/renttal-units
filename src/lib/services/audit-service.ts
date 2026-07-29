import type { AuthContext } from '@/types/database';
import { auditLogsRepository } from '@/lib/repositories/settings';
import { logger, type LogContext } from '@/lib/observability';

export const auditService = {
  async log(
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: Record<string, unknown> | unknown | null,
    newValues: Record<string, unknown> | unknown | null,
    ctx: LogContext
  ): Promise<void> {
    if (!auth.userId) return;

    try {
      await auditLogsRepository.create({
        user_id: auth.userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        old_values: oldValues ? (oldValues as Record<string, unknown>) : undefined,
        new_values: newValues ? (newValues as Record<string, unknown>) : undefined,
      }, ctx);

      logger.info(`Audit: ${action} ${entityType}`, {
        ...ctx,
        service: 'audit',
        user_id: auth.userId,
        entity_type: entityType,
        entity_id: entityId,
        operation: action,
      });
    } catch (error) {
      logger.error('Failed to write audit log', { ...ctx, error: String(error) });
    }
  },
};
