import crypto from 'crypto';
import axios from 'axios';
import { env } from '../config/env';

type Args = Record<string, string | undefined>;

function parseArgs(argv: string[]) {
  return argv.reduce<Args>((acc, item) => {
    const [key, ...valueParts] = item.replace(/^--/, '').split('=');
    acc[key] = valueParts.join('=') || 'true';
    return acc;
  }, {});
}

function requireValue(args: Args, key: string) {
  const value = args[key];

  if (!value) {
    throw new Error(`Missing --${key}=...`);
  }

  return value;
}

function buildEvent(args: Args) {
  const event = args.event ?? 'payment.captured';
  const amount = Number(args.amount ?? 10000);

  if (event === 'payment.captured' || event === 'payment.failed') {
    const orderId = requireValue(args, 'orderId');
    const paymentId = args.paymentId ?? `pay_local_${Date.now()}`;

    return {
      event,
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount
          }
        }
      }
    };
  }

  if (
    event === 'subscription.activated' ||
    event === 'subscription.charged' ||
    event === 'subscription.paused' ||
    event === 'subscription.cancelled'
  ) {
    const subscriptionId = requireValue(args, 'subscriptionId');
    const paymentId = args.paymentId ?? `pay_local_${Date.now()}`;

    return {
      event,
      payload: {
        subscription: {
          entity: {
            id: subscriptionId,
            status:
              event === 'subscription.cancelled'
                ? 'cancelled'
                : event === 'subscription.paused'
                  ? 'halted'
                  : 'active'
          }
        },
        payment:
          event === 'subscription.charged'
            ? {
                entity: {
                  id: paymentId,
                  amount
                }
              }
            : undefined
      }
    };
  }

  throw new Error(`Unsupported event "${event}"`);
}

async function main() {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is required to sign local webhook events');
  }

  const args = parseArgs(process.argv.slice(2));
  const url = args.url ?? 'http://localhost:4000/api/webhooks/razorpay';
  const body = JSON.stringify(buildEvent(args));
  const signature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(Buffer.from(body))
    .digest('hex');

  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': signature
    },
    timeout: 8000,
    validateStatus: () => true
  });

  console.log(`POST ${url}`);
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(response.data, null, 2));

  if (response.status < 200 || response.status >= 300) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
