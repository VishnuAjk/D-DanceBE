import pino, { type LoggerOptions } from 'pino';
import pinoHttp from 'pino-http';
import { env } from '../config/env';

const redact: LoggerOptions['redact'] = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.body.otp',
    'req.body.password',
    'req.body.accessToken',
    'req.body.refreshToken',
    'req.body.token',
    'req.body.secret',
    'req.body.key_secret',
    'req.body.subscription.keys.auth',
    'res.headers.set-cookie',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'SENTRY_DSN'
  ],
  censor: '[REDACTED]'
};

export const logger = pino({ level: env.LOG_LEVEL, redact });

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  redact
});
