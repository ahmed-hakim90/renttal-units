import { logger, type LogContext } from './logger';
import { captureException } from './sentry';

export interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
  context?: LogContext;
}

export const telemetry = {
  track(event: TelemetryEvent) {
    logger.info(`Telemetry: ${event.name}`, {
      ...event.context,
      event: event.name,
      properties: event.properties,
    });
  },

  trackError(error: unknown, context?: LogContext) {
    logger.error('Error tracked', {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error, context);
  },

  trackMutation(entityType: string, action: string, entityId: string, context?: LogContext) {
    this.track({
      name: `${entityType}.${action}`,
      properties: { entity_id: entityId },
      context: { ...context, entity_type: entityType, entity_id: entityId, operation: action },
    });
  },
};
