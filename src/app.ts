import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { instructorRouter } from './routes/instructor';
import { studentRouter } from './routes/student';
import { sendSuccess } from './utils/response';

export function createApp(): Express {
  const app = express();

  // Security headers
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
    })
  );
  app.use(compression());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  // Raw body MUST come before json() parser because Razorpay webhook needs raw body.
  app.use('/api/webhooks/razorpay', express.raw({ type: 'application/json' }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request tracking + logging
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // Health check (no auth required)
  app.get('/health', (req, res) => {
    return sendSuccess(req, res, { status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/instructor', instructorRouter);
  app.use('/api/student', studentRouter);

  // Routes will be mounted here by subsequent tickets.
  // app.use('/api/student', studentRouter);
  // app.use('/api/webhooks', webhookRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found'
      },
      meta: {
        requestId: 'N/A',
        timestamp: new Date().toISOString()
      }
    });
  });

  app.use(errorHandler);

  return app;
}
