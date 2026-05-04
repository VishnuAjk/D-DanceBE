import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { getRazorpayClient } from '../../adapters/razorpay';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { Child } from '../../models/Child';
import { Enrollment } from '../../models/Enrollment';
import { FeeLedger } from '../../models/FeeLedger';
import { logAudit } from '../../models/AuditLog';
import { Payment } from '../../models/Payment';
import { sendSuccess } from '../../utils/response';

export const feesRouter: ExpressRouter = Router();

const MonthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const InitiatePaymentSchema = z.object({
  ledgerIds: z.array(ObjectIdString).min(1)
});
const CreateSubscriptionSchema = z.object({
  enrollmentId: ObjectIdString,
  totalCount: z.coerce.number().int().min(1).max(60).optional()
});

function currentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function findOwnedEnrollment(enrollmentId: string, parentId: string) {
  const children = await Child.find({
    parentId,
    isActive: true
  }).select('_id');
  const childIds = children.map((child) => child._id);

  const enrollment = await Enrollment.findOne({
    _id: enrollmentId,
    childId: { $in: childIds },
    status: { $in: ['APPROVED', 'ACTIVE'] }
  })
    .populate('batchId', 'name monthlyFee schedule')
    .populate('childId', 'name dob gender photo')
    .populate('branchId', 'name city');

  if (!enrollment) {
    throw new AppError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment not found for this parent');
  }

  return enrollment;
}

feesRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        childId: ObjectIdString.optional(),
        month: MonthString.optional()
      })
      .parse(req.query);

    const children = await Child.find({
      parentId: req.user!.userId,
      isActive: true
    }).select('_id');

    const childIds = children.map((child) => String(child._id));
    const filter: Record<string, unknown> = {
      childId: { $in: query.childId ? [query.childId] : childIds }
    };

    if (query.month) {
      filter.month = query.month;
    }

    const fees = await FeeLedger.find(filter)
      .populate('childId', 'name dob gender photo')
      .populate('branchId', 'name city')
      .populate({
        path: 'enrollmentId',
        populate: {
          path: 'batchId',
          select: 'name schedule monthlyFee'
        }
      })
      .sort({ month: -1, dueDate: 1, createdAt: -1 });

    return sendSuccess(req, res, fees);
  } catch (err) {
    return next(err);
  }
});

feesRouter.post('/pay', async (req, res, next) => {
  try {
    const payload = InitiatePaymentSchema.parse(req.body);
    const ledgerIds = Array.from(new Set(payload.ledgerIds));
    const children = await Child.find({
      parentId: req.user!.userId,
      isActive: true
    }).select('_id');
    const childIds = children.map((child) => String(child._id));

    const ledgers = await FeeLedger.find({
      _id: { $in: ledgerIds },
      childId: { $in: childIds }
    }).sort({ month: 1, dueDate: 1, createdAt: 1 });

    if (ledgers.length !== ledgerIds.length) {
      throw new AppError(404, 'LEDGER_NOT_FOUND', 'One or more fee entries could not be found for this parent');
    }

    const invalidStatus = ledgers.find(
      (ledger) => ledger.status !== 'DUE' && ledger.status !== 'OVERDUE'
    );

    if (invalidStatus) {
      throw new AppError(409, 'INVALID_STATUS', 'Only due or overdue entries can be paid online');
    }

    const totalRupees = ledgers.reduce((sum, ledger) => sum + ledger.finalAmount, 0);
    const amount = Math.round(totalRupees * 100);

    if (amount <= 0) {
      throw new AppError(409, 'INVALID_AMOUNT', 'Selected fee entries do not have a payable balance');
    }

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      notes: {
        parentId: req.user!.userId,
        ledgerIds: ledgerIds.join(',')
      }
    });

    const firstLedger = ledgers[0];

    const payment = await Payment.create({
      parentId: req.user!._id,
      enrollmentId: firstLedger.enrollmentId,
      feeLedgerId: firstLedger._id,
      feeLedgerIds: ledgers.map((ledger) => ledger._id),
      childId: firstLedger.childId,
      branchId: firstLedger.branchId,
      months: ledgers.map((ledger) => ledger.month),
      amount,
      currency: order.currency,
      status: 'CREATED',
      type: 'one_time',
      razorpayOrderId: order.id,
      notes: {
        ledgerIds,
        payableRupees: totalRupees,
        entryCount: ledgers.length
      }
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'PAYMENT_INITIATED',
      resourceType: 'payment',
      resourceId: String(payment._id),
      branchId: String(firstLedger.branchId),
      payload: {
        orderId: order.id,
        ledgerIds,
        amount,
        currency: order.currency
      },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID ?? null
    });
  } catch (err) {
    return next(err);
  }
});

feesRouter.post('/subscribe', async (req, res, next) => {
  try {
    if (!env.RAZORPAY_PLAN_ID) {
      throw new AppError(503, 'SUBSCRIPTION_UNAVAILABLE', 'Recurring subscriptions are not configured right now');
    }

    const payload = CreateSubscriptionSchema.parse(req.body);
    const enrollment = await findOwnedEnrollment(payload.enrollmentId, req.user!.userId);
    const existing = await Payment.findOne({
      enrollmentId: enrollment._id,
      type: 'subscription',
      status: { $in: ['CREATED', 'ACTIVE', 'PAUSED'] }
    });

    if (existing) {
      throw new AppError(409, 'SUBSCRIPTION_EXISTS', 'A subscription already exists for this enrollment');
    }

    const batch = enrollment.batchId as unknown as { monthlyFee: number; name: string };
    const razorpay = getRazorpayClient();
    const subscription = await razorpay.subscriptions.create({
      plan_id: env.RAZORPAY_PLAN_ID,
      total_count: payload.totalCount ?? 12,
      quantity: 1,
      customer_notify: 1,
      notes: {
        parentId: req.user!.userId,
        enrollmentId: String(enrollment._id),
        childId: String(enrollment.childId),
        branchId: String(enrollment.branchId)
      }
    });

    const currentLedger = await FeeLedger.findOne({
      enrollmentId: enrollment._id,
      month: currentMonthString()
    }).sort({ createdAt: -1 });

    const payment = await Payment.create({
      parentId: req.user!._id,
      enrollmentId: enrollment._id,
      feeLedgerId: currentLedger?._id,
      feeLedgerIds: currentLedger ? [currentLedger._id] : [],
      childId: enrollment.childId,
      branchId: enrollment.branchId,
      months: currentLedger ? [currentLedger.month] : [],
      amount: Math.round(Number(batch.monthlyFee ?? 0) * 100),
      currency: 'INR',
      status: 'CREATED',
      type: 'subscription',
      razorpaySubscriptionId: subscription.id,
      notes: {
        subscriptionStatus: subscription.status,
        shortUrl: subscription.short_url,
        processedEventKeys: []
      }
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'SUBSCRIPTION_INITIATED',
      resourceType: 'payment',
      resourceId: String(payment._id),
      branchId: String(enrollment.branchId),
      payload: {
        enrollmentId: String(enrollment._id),
        razorpaySubscriptionId: subscription.id,
        totalCount: payload.totalCount ?? 12
      },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(
      req,
      res,
      {
        subscriptionId: subscription.id,
        shortUrl: subscription.short_url,
        status: subscription.status,
        paymentId: String(payment._id),
        keyId: env.RAZORPAY_KEY_ID ?? null
      },
      201
    );
  } catch (err) {
    return next(err);
  }
});

feesRouter.get('/subscriptions', async (req, res, next) => {
  try {
    const children = await Child.find({
      parentId: req.user!.userId,
      isActive: true
    }).select('_id');
    const childIds = children.map((child) => child._id);

    const subscriptions = await Payment.find({
      type: 'subscription',
      childId: { $in: childIds }
    })
      .populate('childId', 'name dob gender photo')
      .populate('branchId', 'name city')
      .populate({
        path: 'enrollmentId',
        populate: {
          path: 'batchId',
          select: 'name schedule monthlyFee'
        }
      })
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, subscriptions);
  } catch (err) {
    return next(err);
  }
});
