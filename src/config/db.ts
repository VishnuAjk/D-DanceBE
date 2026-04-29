import mongoose from 'mongoose';
import { logger } from '../middleware/logger';

export async function connectDB(uri: string, retries = 5): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      });
      logger.info({ attempt }, 'MongoDB connected');
      return;
    } catch (err) {
      logger.warn({ attempt, err }, `MongoDB connection failed (attempt ${attempt}/${retries})`);

      if (attempt === retries) {
        throw new Error('MongoDB: max connection retries exceeded');
      }

      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected - will auto-reconnect');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'MongoDB connection error');
});
