import * as Sentry from '@sentry/nextjs';

let initialized = false;

export function initSentry() {
  if (initialized || !process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        delete headers['authorization'];
        delete headers['cookie'];
      }
      return event;
    },
  });
  initialized = true;
}

export function setSentryUser(userId: string, email?: string, role?: string) {
  Sentry.setUser({ id: userId, email, role });
}

export function setSentryContext(correlationId: string, extra?: Record<string, unknown>) {
  Sentry.setContext('request', { correlation_id: correlationId, ...extra });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

export { Sentry };
