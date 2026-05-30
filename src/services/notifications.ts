import { sendPushNotification, sendSmsNotification } from '../adapters/notification';
import { logger } from '../middleware/logger';
import { StudentProfile } from '../models/StudentProfile';
import { FeeLedger } from '../models/FeeLedger';
import { User } from '../models/User';

async function notifySafely(task: Promise<unknown>, context: string) {
  try {
    await task;
  } catch (err) {
    logger.error({ err, context }, 'Notification dispatch failed');
  }
}

async function findCustomerForStudentProfile(studentProfileId: string) {
  const studentProfile = await StudentProfile.findById(studentProfileId).select('name customerId');
  if (!studentProfile) {
    return null;
  }

  const customer = await User.findById(studentProfile.customerId).select('phone name');
  if (!customer) {
    return null;
  }

  return { studentProfile, customer };
}

export async function notifyBranchAdminsEnrollmentSubmitted(branchId: string, studentProfileName: string) {
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
          body: `${studentProfileName} has a new enrollment request awaiting review.`,
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
            message: `Dance App: New enrollment request for ${studentProfileName} is awaiting review.`
          }
        ),
        'ENROLLMENT_SUBMITTED_SMS'
      );
    })
  );
}

export async function notifyCustomerEnrollmentApproved(studentProfileId: string) {
  const result = await findCustomerForStudentProfile(studentProfileId);
  if (!result) {
    return;
  }

  await notifySafely(
    sendPushNotification(String(result.customer._id), 'ENROLLMENT_APPROVED_PUSH', {
      title: 'Enrollment approved',
      body: `${result.studentProfile.name}'s enrollment was approved.`,
      url: '/portal/enrollments'
    }),
    'ENROLLMENT_APPROVED_PUSH'
  );
}

export async function notifyCustomerEnrollmentRejected(studentProfileId: string) {
  const result = await findCustomerForStudentProfile(studentProfileId);
  if (!result) {
    return;
  }

  await notifySafely(
    sendPushNotification(String(result.customer._id), 'ENROLLMENT_REJECTED_PUSH', {
      title: 'Enrollment update',
      body: `${result.studentProfile.name}'s enrollment request was rejected.`,
      url: '/portal/enrollments'
    }),
    'ENROLLMENT_REJECTED_PUSH'
  );

  await notifySafely(
    sendSmsNotification(
      String(result.customer._id),
      'ENROLLMENT_REJECTED_SMS',
      result.customer.phone,
      {
        message: `Dance App: ${result.studentProfile.name}'s enrollment request was rejected. Check the portal for details.`
      }
    ),
    'ENROLLMENT_REJECTED_SMS'
  );
}

export async function notifyCustomerPaymentConfirmed(payment: {
  customerId?: string;
  studentProfileId?: string;
  amount?: number;
}) {
  let customerId = payment.customerId;
  let studentProfileName = 'Your student profile';
  let phone: string | null = null;

  if (payment.studentProfileId) {
    const result = await findCustomerForStudentProfile(payment.studentProfileId);
    if (result) {
      customerId = customerId ?? String(result.customer._id);
      studentProfileName = result.studentProfile.name;
      phone = result.customer.phone;
    }
  }

  if (!customerId) {
    return;
  }

  await notifySafely(
    sendPushNotification(customerId, 'PAYMENT_CONFIRMED_PUSH', {
      title: 'Payment confirmed',
      body: `${studentProfileName}'s payment of INR ${(Number(payment.amount ?? 0) / 100).toFixed(2)} was confirmed.`,
      url: '/portal/fees'
    }),
    'PAYMENT_CONFIRMED_PUSH'
  );

  if (phone) {
    void phone;
  }
}

export async function notifyCustomerAssessmentShared(studentProfileId: string) {
  const result = await findCustomerForStudentProfile(studentProfileId);
  if (!result) {
    return;
  }

  await notifySafely(
    sendPushNotification(String(result.customer._id), 'ASSESSMENT_SHARED_PUSH', {
      title: 'Assessment shared',
      body: `A new progress assessment for ${result.studentProfile.name} is available.`,
      url: '/portal/assessments'
    }),
    'ASSESSMENT_SHARED_PUSH'
  );
}

export async function sendFeeDueNotifications(referenceDate = new Date()) {
  const month = `${referenceDate.getUTCFullYear()}-${String(referenceDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const ledgers = await FeeLedger.find({
    month,
    status: { $in: ['DUE', 'OVERDUE'] }
  }).select('_id studentProfileId finalAmount month');

  const sentToCustomers = new Set<string>();

  for (const ledger of ledgers) {
    const result = await findCustomerForStudentProfile(String(ledger.studentProfileId));
    if (!result) {
      continue;
    }

    const customerId = String(result.customer._id);
    if (sentToCustomers.has(customerId)) {
      continue;
    }

    sentToCustomers.add(customerId);

    await notifySafely(
      sendPushNotification(customerId, 'FEE_DUE_PUSH', {
        title: 'Fee due reminder',
        body: `Fee payment for ${result.studentProfile.name} is due for ${ledger.month}.`,
        url: '/portal/fees'
      }),
      'FEE_DUE_PUSH'
    );

    await notifySafely(
      sendSmsNotification(customerId, 'FEE_DUE_SMS', result.customer.phone, {
        message: `Dance App: Fee payment for ${result.studentProfile.name} is due for ${ledger.month}.`
      }),
      'FEE_DUE_SMS'
    );
  }

  return { month, customerCount: sentToCustomers.size };
}
