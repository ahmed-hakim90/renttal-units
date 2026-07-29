import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProductionEnv } = await import('./lib/env/production');
    assertProductionEnv();
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.server.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
