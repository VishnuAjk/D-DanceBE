import { createApp } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { captureException, initSentry } from './config/sentry';
import { logger } from './middleware/logger';

async function bootstrap() {
  initSentry();
  await connectDB(env.MONGODB_URI);
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API server started');
  });
}

bootstrap().catch((err) => {
  captureException(err);
  logger.fatal({ err }, 'Bootstrap failed');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  captureException(err);
  logger.fatal({ err }, 'Uncaught exception - shutting down');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  captureException(reason);
  logger.fatal({ reason }, 'Unhandled rejection - shutting down');
  process.exit(1);
});
