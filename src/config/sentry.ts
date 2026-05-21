import type { Express } from 'express';
import * as Sentry from '@sentry/node';
import { env } from './env';

export function initSentry() {
  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
  });
}

export function setupSentryErrorHandler(app: Express) {
  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.setupExpressErrorHandler(app);
}

export function captureException(error: unknown) {
  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.captureException(error);
}
