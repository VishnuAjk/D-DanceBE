import { sendPushNotification, sendSmsNotification } from '../adapters/notification';
import { logger } from '../middleware/logger';
import { Child } from '../models/Child';
import { FeeLedger } from '../models/FeeLedger';
import { User } from '../models/User';

async function notifySafely(task: Promise<unknown>, context: string) {
  try {
    await task;
  } catch (err) {
    logger.error({ err, context }, 'Notification dispatch failed');
  }
}

async function findParentForChild(childId: string) {
  const child = await Child.findById(childId).select('name parentId');
  if (!child) {
    return null;
  }

  const parent = await User.findById(child.parentId).select('phone name');
  if (!parent) {
    return null;
  }

  return { child, parent };
}

export async function notifyBranchAdminsEnrollmentSubmitted(branchId: string, childName: string) {
  const admins = await User.find({
    role: 'branch_admin',
    status: 'active',
    branchIds: branchId
  }).select('_id phone');

  await Promise.all(
    admins.map(async (admin) => {
      await notifySafely(
        sendPushNotification(String(admin._id), 'ENROLLMENT_SUBMITTED_PUSH', {
          title: 'New enrollment request',
          body: `${childName} has a new enrollment request awaiting review.`,
          url: '/admin/enrollments'
        }),
        'ENROLLMENT_SUBMITTED_PUSH'
      );

      await notifySafely(
        sendSmsNotification(
          String(admin._id),
          'ENROLLMENT_SUBMITTED_SMS',
          admin.phone,
          {
            message: `Dance App: New enrollment request for ${childName} is awaiting review.`
          }
        ),
        'ENROLLMENT_SUBMITTED_SMS'
      );
    })
  );
}

export async function notifyParentEnrollmentApproved(childId: string) {
  const result = await findParentForChild(childId);
  if (!result) {
    return;
  }

  await notifySafely(
    sendPushNotification(String(result.parent._id), 'ENROLLMENT_APPROVED_PUSH', {
      title: 'Enrollment approved',
      body: `${result.child.name}'s enrollment was approved.`,
      url: '/parent/enrollments'
    }),
    'ENROLLMENT_APPROVED_PUSH'
  );
}

export async function notifyParentEnrollmentRejected(childId: string) {
  const result = await findParentForChild(childId);
  if (!result) {
    return;
  }

  await notifySafely(
    sendPushNotification(String(result.parent._id), 'ENROLLMENT_REJECTED_PUSH', {
      title: 'Enrollment update',
      body: `${result.child.name}'s enrollment request was rejected.`,
      url: '/parent/enrollments'
    }),
    'ENROLLMENT_REJECTED_PUSH'
  );

  await notifySafely(
    sendSmsNotification(
      String(result.parent._id),
      'ENROLLMENT_REJECTED_SMS',
      result.parent.phone,
      {
        message: `Dance App: ${result.child.name}'s enrollment request was rejected. Check the parent portal for details.`
      }
    ),
    'ENROLLMENT_REJECTED_SMS'
  );
}

export async function notifyParentPaymentConfirmed(payment: {
  parentId?: string;
  childId?: string;
  amount?: number;
}) {
  let parentId = payment.parentId;
  let childName = 'Your child';
  let phone: string | null = null;

  if (payment.childId) {
    const result = await findParentForChild(payment.childId);
    if (result) {
      parentId = parentId ?? String(result.parent._id);
      childName = result.child.name;
      phone = result.parent.phone;
    }
  }

  if (!parentId) {
    return;
  }

  await notifySafely(
    sendPushNotification(parentId, 'PAYMENT_CONFIRMED_PUSH', {
      title: 'Payment confirmed',
      body: `${childName}'s payment of INR ${(Number(payment.amount ?? 0) / 100).toFixed(2)} was confirmed.`,
      url: '/parent/fees'
    }),
    'PAYMENT_CONFIRMED_PUSH'
  );

  if (phone) {
    void phone;
  }
}

export async function notifyParentAssessmentShared(childId: string) {
  const result = await findParentForChild(childId);
  if (!result) {
    return;
  }

  await notifySafely(
    sendPushNotification(String(result.parent._id), 'ASSESSMENT_SHARED_PUSH', {
      title: 'Assessment shared',
      body: `A new progress assessment for ${result.child.name} is available.`,
      url: '/parent/assessments'
    }),
    'ASSESSMENT_SHARED_PUSH'
  );
}

export async function sendFeeDueNotifications(referenceDate = new Date()) {
  const month = `${referenceDate.getUTCFullYear()}-${String(referenceDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const ledgers = await FeeLedger.find({
    month,
    status: { $in: ['DUE', 'OVERDUE'] }
  }).select('_id childId finalAmount month');

  const sentToParents = new Set<string>();

  for (const ledger of ledgers) {
    const result = await findParentForChild(String(ledger.childId));
    if (!result) {
      continue;
    }

    const parentId = String(result.parent._id);
    if (sentToParents.has(parentId)) {
      continue;
    }

    sentToParents.add(parentId);

    await notifySafely(
      sendPushNotification(parentId, 'FEE_DUE_PUSH', {
        title: 'Fee due reminder',
        body: `Fee payment for ${result.child.name} is due for ${ledger.month}.`,
        url: '/parent/fees'
      }),
      'FEE_DUE_PUSH'
    );

    await notifySafely(
      sendSmsNotification(parentId, 'FEE_DUE_SMS', result.parent.phone, {
        message: `Dance App: Fee payment for ${result.child.name} is due for ${ledger.month}.`
      }),
      'FEE_DUE_SMS'
    );
  }

  return { month, parentCount: sentToParents.size };
}
