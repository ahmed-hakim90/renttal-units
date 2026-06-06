import { generateCorrelationId } from './correlation-id';
import { logger, type LogContext } from './logger';

export interface Span {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  context: LogContext;
}

const activeSpans = new Map<string, Span>();

export function startSpan(name: string, context: LogContext = {}): Span {
  const traceId = context.trace_id ?? generateCorrelationId();
  const spanId = generateCorrelationId();
  const span: Span = {
    traceId,
    spanId,
    name,
    startTime: Date.now(),
    context: { ...context, trace_id: traceId, span_id: spanId },
  };
  activeSpans.set(spanId, span);
  logger.debug(`Span started: ${name}`, span.context);
  return span;
}

export function endSpan(span: Span, status: 'ok' | 'error' = 'ok') {
  const duration = Date.now() - span.startTime;
  activeSpans.delete(span.spanId);
  logger.info(`Span ended: ${span.name}`, {
    ...span.context,
    duration_ms: duration,
    status,
  });
}

export async function withSpan<T>(
  name: string,
  context: LogContext,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const span = startSpan(name, context);
  try {
    const result = await fn(span);
    endSpan(span, 'ok');
    return result;
  } catch (error) {
    endSpan(span, 'error');
    throw error;
  }
}
