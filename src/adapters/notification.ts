import axios from 'axios';
import webpush from 'web-push';
import { env } from '../config/env';
import { logger } from '../middleware/logger';
import { NotificationLog } from '../models/NotificationLog';
import { User } from '../models/User';

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type SmsPayload = {
  message: string;
};

const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export async function sendPushNotification(userId: string, template: string, payload: PushPayload) {
  const user = await User.findById(userId).select('webPushSubscriptions');

  if (!user?.webPushSubscriptions?.length) {
    return;
  }

  const log = await NotificationLog.create({
    channel: 'push',
    status: 'pending',
    template,
    recipient: userId,
    userId,
    payload
  });

  if (!pushEnabled) {
    await NotificationLog.updateOne(
      { _id: log._id },
      {
        status: 'failed',
        errorMessage: 'VAPID keys are not configured'
      }
    );
    return;
  }

  const results = await Promise.allSettled(
    user.webPushSubscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys
        },
        JSON.stringify(payload)
      )
    )
  );

  const firstRejected = results.find((result) => result.status === 'rejected');
  await NotificationLog.updateOne(
    { _id: log._id },
    {
      status: firstRejected ? 'failed' : 'sent',
      sentAt: firstRejected ? undefined : new Date(),
      errorMessage:
        firstRejected?.status === 'rejected' ? String(firstRejected.reason) : undefined
    }
  );
}

export async function sendSmsNotification(
  userId: string,
  template: string,
  phone: string,
  payload: SmsPayload
) {
  const log = await NotificationLog.create({
    channel: 'sms',
    status: 'pending',
    template,
    recipient: phone,
    userId,
    payload
  });

  if (env.OTP_PROVIDER === 'mock') {
    logger.info({ phone, message: payload.message }, '[MockSMS] Notification sent');
    await NotificationLog.updateOne(
      { _id: log._id },
      {
        status: 'sent',
        sentAt: new Date(),
        externalMessageId: `mock-sms-${Date.now()}`
      }
    );
    return;
  }

  try {
    const response = await axios.post(
      'https://api.msg91.com/api/v2/sendsms',
      {
        sender: env.MSG91_SENDER_ID,
        route: '4',
        country: '91',
        sms: [
          {
            message: payload.message,
            to: [phone]
          }
        ]
      },
      {
        timeout: 8000,
        headers: {
          authkey: env.MSG91_AUTH_KEY ?? ''
        }
      }
    );

    await NotificationLog.updateOne(
      { _id: log._id },
      {
        status: 'sent',
        sentAt: new Date(),
        externalMessageId: String(response.data?.request_id ?? '')
      }
    );
  } catch (err) {
    logger.error({ err, phone, template }, 'SMS notification failed');
    await NotificationLog.updateOne(
      { _id: log._id },
      {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'SMS send failed'
      }
    );
  }
}
