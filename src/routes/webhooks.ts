import crypto from 'crypto';
import { Router, type Router as ExpressRouter } from 'express';
import { env } from '../config/env';
import { logger } from '../middleware/logger';
import { logAudit } from '../models/AuditLog';
import { FeeLedger } from '../models/FeeLedger';
import { Payment } from '../models/Payment';
import { notifyParentPaymentConfirmed } from '../services/notifications';

export const webhookRouter: ExpressRouter = Router();

function verifySignature(body: Buffer, signature: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex') === signature;
}

function readNotes(payment: (typeof Payment)['prototype']) {
  return (payment.notes ?? {}) as Record<string, unknown>;
}

function withProcessedEvent(payment: (typeof Payment)['prototype'], eventKey: string) {
  const notes = readNotes(payment);
  const processed = Array.isArray(notes.processedEventKeys)
    ? notes.processedEventKeys.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    notes,
    processed,
    alreadyProcessed: processed.includes(eventKey)
  };
}

async function markNextDueLedgerPaid(payment: (typeof Payment)['prototype'], paidAt: Date) {
  if (!payment.enrollmentId) {
    return null;
  }

  const ledger = await FeeLedger.findOne({
    enrollmentId: payment.enrollmentId,
    status: { $in: ['DUE', 'OVERDUE'] }
  }).sort({ month: 1, dueDate: 1, createdAt: 1 });

  if (!ledger) {
    return null;
  }

  ledger.status = 'PAID';
  ledger.paidAt = paidAt;
  ledger.paymentId = payment._id;
  await ledger.save();

  return ledger;
}

webhookRouter.post('/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    logger.error('Razorpay webhook secret is not configured');
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  if (!Buffer.isBuffer(req.body)) {
    logger.error('Razorpay webhook did not receive a raw body buffer');
    return res.status(500).json({ error: 'Invalid webhook body configuration' });
  }

  if (typeof signature !== 'string' || !verifySignature(req.body, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
    logger.warn({ signature }, 'Razorpay webhook: invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const event = JSON.parse(req.body.toString()) as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            amount?: number;
          };
        };
        subscription?: {
          entity?: {
            id?: string;
            status?: string;
          };
        };
      };
    };

    logger.info({ event: event.event }, 'Razorpay webhook received');

    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity;

      if (!paymentEntity?.id || !paymentEntity.order_id) {
        logger.warn({ event }, 'Razorpay webhook missing payment capture identifiers');
        return res.status(200).json({ received: true });
      }

      const existing = await Payment.findOne({ razorpayPaymentId: paymentEntity.id });

      if (existing?.status === 'CAPTURED') {
        return res.status(200).json({ received: true });
      }

      const paymentRecord = await Payment.findOneAndUpdate(
        { razorpayOrderId: paymentEntity.order_id },
        {
          razorpayPaymentId: paymentEntity.id,
          status: 'CAPTURED',
          paidAt: new Date(),
          webhookProcessedAt: new Date()
        },
        { new: true }
      );

      if (!paymentRecord) {
        logger.warn({ orderId: paymentEntity.order_id }, 'Captured payment webhook did not match any local payment record');
        return res.status(200).json({ received: true });
      }

      if (paymentRecord.feeLedgerIds?.length) {
        await FeeLedger.updateMany(
          { _id: { $in: paymentRecord.feeLedgerIds } },
          {
            status: 'PAID',
            paidAt: paymentRecord.paidAt ?? new Date(),
            paymentId: paymentRecord._id
          }
        );
      }

      if (paymentRecord.parentId) {
        await logAudit({
          actorId: String(paymentRecord.parentId),
          action: 'PAYMENT_CAPTURED',
          resourceType: 'payment',
          resourceId: String(paymentRecord._id),
          branchId: paymentRecord.branchId ? String(paymentRecord.branchId) : undefined,
          payload: {
            razorpayPaymentId: paymentEntity.id,
            razorpayOrderId: paymentEntity.order_id,
            amount: paymentEntity.amount
          },
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });
      }

      void notifyParentPaymentConfirmed({
        parentId: paymentRecord.parentId ? String(paymentRecord.parentId) : undefined,
        childId: paymentRecord.childId ? String(paymentRecord.childId) : undefined,
        amount: paymentEntity.amount
      });
    }

    if (event.event === 'payment.failed') {
      const paymentEntity = event.payload?.payment?.entity;

      if (!paymentEntity?.order_id) {
        logger.warn({ event }, 'Razorpay webhook missing payment failure order identifier');
        return res.status(200).json({ received: true });
      }

      const paymentRecord = await Payment.findOneAndUpdate(
        { razorpayOrderId: paymentEntity.order_id },
        {
          razorpayPaymentId: paymentEntity.id,
          status: 'FAILED',
          webhookProcessedAt: new Date()
        },
        { new: true }
      );

      if (paymentRecord?.parentId) {
        await logAudit({
          actorId: String(paymentRecord.parentId),
          action: 'PAYMENT_FAILED',
          resourceType: 'payment',
          resourceId: String(paymentRecord._id),
          branchId: paymentRecord.branchId ? String(paymentRecord.branchId) : undefined,
          payload: {
            razorpayPaymentId: paymentEntity.id,
            razorpayOrderId: paymentEntity.order_id,
            amount: paymentEntity.amount
          },
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });
      }
    }

    if (event.event === 'subscription.activated') {
      const subscriptionEntity = event.payload?.subscription?.entity;

      if (!subscriptionEntity?.id) {
        logger.warn({ event }, 'Subscription activation webhook missing subscription identifier');
        return res.status(200).json({ received: true });
      }

      const paymentRecord = await Payment.findOne({ razorpaySubscriptionId: subscriptionEntity.id });

      if (!paymentRecord) {
        logger.warn({ subscriptionId: subscriptionEntity.id }, 'Subscription activation webhook did not match any local payment record');
        return res.status(200).json({ received: true });
      }

      const eventKey = `subscription.activated:${subscriptionEntity.id}`;
      const { notes, processed, alreadyProcessed } = withProcessedEvent(paymentRecord, eventKey);

      if (!alreadyProcessed) {
        await markNextDueLedgerPaid(paymentRecord, new Date());
      }

      paymentRecord.status = 'ACTIVE';
      paymentRecord.webhookProcessedAt = new Date();
      paymentRecord.notes = {
        ...notes,
        subscriptionStatus: subscriptionEntity.status ?? 'active',
        processedEventKeys: alreadyProcessed ? processed : [...processed, eventKey]
      };
      await paymentRecord.save();

      void notifyParentPaymentConfirmed({
        parentId: paymentRecord.parentId ? String(paymentRecord.parentId) : undefined,
        childId: paymentRecord.childId ? String(paymentRecord.childId) : undefined,
        amount: paymentRecord.amount
      });
    }

    if (event.event === 'subscription.charged') {
      const subscriptionEntity = event.payload?.subscription?.entity;
      const paymentEntity = event.payload?.payment?.entity;

      if (!subscriptionEntity?.id) {
        logger.warn({ event }, 'Subscription charged webhook missing subscription identifier');
        return res.status(200).json({ received: true });
      }

      const paymentRecord = await Payment.findOne({ razorpaySubscriptionId: subscriptionEntity.id });

      if (!paymentRecord) {
        logger.warn({ subscriptionId: subscriptionEntity.id }, 'Subscription charged webhook did not match any local payment record');
        return res.status(200).json({ received: true });
      }

      const chargeId = paymentEntity?.id ?? `subscription.charged:${subscriptionEntity.id}`;
      const eventKey = `subscription.charged:${chargeId}`;
      const { notes, processed, alreadyProcessed } = withProcessedEvent(paymentRecord, eventKey);

      if (!alreadyProcessed) {
        await markNextDueLedgerPaid(paymentRecord, new Date());
      }

      paymentRecord.status = 'ACTIVE';
      paymentRecord.paidAt = new Date();
      paymentRecord.webhookProcessedAt = new Date();
      paymentRecord.notes = {
        ...notes,
        subscriptionStatus: subscriptionEntity.status ?? 'active',
        processedEventKeys: alreadyProcessed ? processed : [...processed, eventKey],
        lastSubscriptionChargeId: paymentEntity?.id ?? null
      };
      await paymentRecord.save();

      void notifyParentPaymentConfirmed({
        parentId: paymentRecord.parentId ? String(paymentRecord.parentId) : undefined,
        childId: paymentRecord.childId ? String(paymentRecord.childId) : undefined,
        amount: paymentEntity?.amount ?? paymentRecord.amount
      });
    }

    if (event.event === 'subscription.paused' || event.event === 'subscription.cancelled') {
      const subscriptionEntity = event.payload?.subscription?.entity;

      if (!subscriptionEntity?.id) {
        logger.warn({ event }, 'Subscription lifecycle webhook missing subscription identifier');
        return res.status(200).json({ received: true });
      }

      const paymentRecord = await Payment.findOne({ razorpaySubscriptionId: subscriptionEntity.id });

      if (!paymentRecord) {
        logger.warn({ subscriptionId: subscriptionEntity.id }, 'Subscription lifecycle webhook did not match any local payment record');
        return res.status(200).json({ received: true });
      }

      paymentRecord.status = event.event === 'subscription.paused' ? 'PAUSED' : 'CANCELLED';
      paymentRecord.webhookProcessedAt = new Date();
      paymentRecord.notes = {
        ...readNotes(paymentRecord),
        subscriptionStatus:
          subscriptionEntity.status ?? (event.event === 'subscription.paused' ? 'halted' : 'cancelled')
      };
      await paymentRecord.save();
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err }, 'Razorpay webhook processing error');
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});
