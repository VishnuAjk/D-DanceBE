import { env } from '../config/env';

type Check = {
  name: string;
  status: 'ready' | 'mock' | 'missing' | 'optional';
  detail: string;
};

function present(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

const checks: Check[] = [
  {
    name: 'OTP login',
    status: env.OTP_PROVIDER === 'mock' ? 'mock' : present(env.MSG91_AUTH_KEY) && present(env.MSG91_TEMPLATE_ID) ? 'ready' : 'missing',
    detail:
      env.OTP_PROVIDER === 'mock'
        ? 'OTP_PROVIDER=mock; use OTP 123456 locally.'
        : 'OTP_PROVIDER=msg91 requires MSG91_AUTH_KEY and MSG91_TEMPLATE_ID.'
  },
  {
    name: 'SMS notifications',
    status: env.OTP_PROVIDER === 'mock' ? 'mock' : present(env.MSG91_AUTH_KEY) ? 'ready' : 'missing',
    detail:
      env.OTP_PROVIDER === 'mock'
        ? 'Notification SMS uses mock logging while OTP_PROVIDER=mock.'
        : 'MSG91 SMS requires MSG91_AUTH_KEY and MSG91_SENDER_ID.'
  },
  {
    name: 'Razorpay orders',
    status: present(env.RAZORPAY_KEY_ID) && present(env.RAZORPAY_KEY_SECRET) ? 'ready' : 'missing',
    detail: 'Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
  },
  {
    name: 'Razorpay webhooks',
    status: present(env.RAZORPAY_WEBHOOK_SECRET) ? 'ready' : 'missing',
    detail: 'Requires RAZORPAY_WEBHOOK_SECRET. Local simulator signs events with this value.'
  },
  {
    name: 'Razorpay subscriptions',
    status: present(env.RAZORPAY_PLAN_ID) ? 'ready' : 'missing',
    detail: 'Requires RAZORPAY_PLAN_ID in addition to Razorpay order credentials.'
  },
  {
    name: 'Web push',
    status: present(env.VAPID_PUBLIC_KEY) && present(env.VAPID_PRIVATE_KEY) ? 'ready' : 'optional',
    detail: 'Requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY. Missing keys are logged as failed delivery, but business flows continue.'
  },
  {
    name: 'Sentry',
    status: present(env.SENTRY_DSN) ? 'ready' : 'optional',
    detail: 'Sentry initializes only when SENTRY_DSN is configured.'
  }
];

const icon = {
  ready: 'READY',
  mock: 'MOCK',
  missing: 'MISSING',
  optional: 'OPTIONAL'
} satisfies Record<Check['status'], string>;

for (const check of checks) {
  console.log(`${icon[check.status]} ${check.name}: ${check.detail}`);
}

const missing = checks.filter((check) => check.status === 'missing');

if (missing.length) {
  console.log('');
  console.log('Missing required configuration for live third-party testing:');
  for (const check of missing) {
    console.log(`- ${check.name}`);
  }
  process.exitCode = 1;
}
