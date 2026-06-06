export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlation_id?: string;
  trace_id?: string;
  span_id?: string;
  user_id?: string;
  role?: string;
  service?: string;
  repository?: string;
  operation?: string;
  entity_type?: string;
  entity_id?: string;
  locale?: string;
  request_path?: string;
  [key: string]: unknown;
}

export interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'api_key', 'authorization', 'cookie'];

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitize(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): LogEntry {
  return sanitize({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  }) as LogEntry;
}

function writeLog(entry: LogEntry) {
  const output = JSON.stringify(entry);
  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'development') {
      writeLog(formatLog('debug', message, context));
    }
  },
  info(message: string, context?: LogContext) {
    writeLog(formatLog('info', message, context));
  },
  warn(message: string, context?: LogContext) {
    writeLog(formatLog('warn', message, context));
  },
  error(message: string, context?: LogContext) {
    writeLog(formatLog('error', message, context));
  },
};
