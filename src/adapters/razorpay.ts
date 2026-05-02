import Razorpay from 'razorpay';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

let client: Razorpay | null = null;

export function getRazorpayClient() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError(503, 'PAYMENT_UNAVAILABLE', 'Online payments are not configured right now');
  }

  if (!client) {
    client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });
  }

  return client;
}
