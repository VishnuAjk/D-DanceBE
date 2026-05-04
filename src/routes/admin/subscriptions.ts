import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { getRazorpayClient } from '../../adapters/razorpay';
import { AppError } from '../../middleware/errorHandler';
import { requireBranchAccess } from '../../middleware/rbac';
import { logAudit } from '../../models/AuditLog';
import { Payment } from '../../models/Payment';
import { sendSuccess } from '../../utils/response';

export const subscriptionsRouter: ExpressRouter = Router();

const CancelSubscriptionSchema = z.object({
  cancelAtCycleEnd: z.boolean().optional()
});

async function findSubscriptionPayment(paymentId: string) {
  const payment = await Payment.findById(paymentId);

  if (!payment || payment.type !== 'subscription') {
    throw new AppError(404, 'NOT_FOUND', 'Subscription record not found');
  }

  if (!payment.razorpaySubscriptionId) {
    throw new AppError(409, 'INVALID_SUBSCRIPTION', 'Subscription is missing a Razorpay subscription id');
  }

  return payment;
}

subscriptionsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = CancelSubscriptionSchema.parse(req.body);
    const payment = await findSubscriptionPayment(id);

    return requireBranchAccess(() => (payment.branchId ? String(payment.branchId) : undefined))(req, res, async () => {
      try {
        const razorpay = getRazorpayClient();
        const cancelled = await razorpay.subscriptions.cancel(
          payment.razorpaySubscriptionId!,
          payload.cancelAtCycleEnd ?? false
        );

        payment.status = 'CANCELLED';
        payment.notes = {
          ...(payment.notes ?? {}),
          subscriptionStatus: cancelled.status,
          cancelledAtCycleEnd: payload.cancelAtCycleEnd ?? false
        };
        payment.webhookProcessedAt = new Date();
        await payment.save();

        await logAudit({
          actorId: req.user!._id,
          action: 'SUBSCRIPTION_CANCELLED',
          resourceType: 'payment',
          resourceId: String(payment._id),
          branchId: payment.branchId ? String(payment.branchId) : undefined,
          payload: {
            razorpaySubscriptionId: payment.razorpaySubscriptionId,
            cancelAtCycleEnd: payload.cancelAtCycleEnd ?? false
          },
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });

        return sendSuccess(req, res, payment);
      } catch (err) {
        return next(err);
      }
    });
  } catch (err) {
    return next(err);
  }
});
