import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { requireBranchAccess } from '../../middleware/rbac';
import { logAudit } from '../../models/AuditLog';
import { Enrollment } from '../../models/Enrollment';
import { FeeLedger } from '../../models/FeeLedger';
import { branchScopedValue } from '../../utils/branchScope';
import { sendSuccess } from '../../utils/response';

export const feesRouter: ExpressRouter = Router();

const MonthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const GenerateLedgerSchema = z.object({
  month: MonthString,
  branchId: ObjectIdString.optional(),
  batchId: ObjectIdString.optional()
});

const DiscountSchema = z.object({
  discount: z.number().min(0),
  notes: z.string().max(200).optional()
});

function dueDateForMonth(month: string) {
  return new Date(`${month}-10T00:00:00.000Z`);
}

async function findLedgerForAdmin(ledgerId: string) {
  const ledger = await FeeLedger.findById(ledgerId);

  if (!ledger) {
    throw new AppError(404, 'NOT_FOUND', 'Fee ledger entry not found');
  }

  return ledger;
}

feesRouter.post('/generate', async (req, res, next) => {
  try {
    const payload = GenerateLedgerSchema.parse(req.body);
    const filter: Record<string, unknown> = {
      status: { $in: ['APPROVED', 'ACTIVE'] }
    };

    if (payload.branchId) {
      filter.branchId = payload.branchId;
    }

    if (payload.batchId) {
      filter.batchId = payload.batchId;
    }

    if (req.user?.role === 'branch_admin') {
      filter.branchId = branchScopedValue(req.user, payload.branchId);
    }

    const enrollments = await Enrollment.find(filter).select('_id studentProfileId branchId batchId').lean();
    const batchIds = Array.from(new Set(enrollments.map((enrollment) => String(enrollment.batchId))));
    const batches = await Enrollment.db
      .collection('batches')
      .find({ _id: { $in: batchIds.map((id) => Enrollment.db.base.Types.ObjectId.createFromHexString(id)) } })
      .project({ monthlyFee: 1 })
      .toArray();
    const batchFeeMap = new Map(batches.map((batch) => [String(batch._id), Number(batch.monthlyFee ?? 0)]));

    const ops = enrollments.map((enrollment) => {
      const monthlyFee = batchFeeMap.get(String(enrollment.batchId)) ?? 0;

      return {
        updateOne: {
          filter: { enrollmentId: enrollment._id, month: payload.month },
          update: {
            $setOnInsert: {
              enrollmentId: enrollment._id,
              studentProfileId: enrollment.studentProfileId,
              branchId: enrollment.branchId,
              month: payload.month,
              amount: monthlyFee,
              discount: 0,
              finalAmount: monthlyFee,
              status: 'DUE' as const,
              dueDate: dueDateForMonth(payload.month)
            }
          },
          upsert: true
        }
      };
    });

    const result = ops.length ? await FeeLedger.collection.bulkWrite(ops) : null;

    await logAudit({
      actorId: req.user!._id,
      action: 'FEE_LEDGER_GENERATED',
      resourceType: 'fee_ledger',
      resourceId: payload.month,
      branchId: payload.branchId,
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, {
      month: payload.month,
      enrollmentCount: enrollments.length,
      insertedCount: result?.upsertedCount ?? 0,
      matchedCount: result?.matchedCount ?? 0
    });
  } catch (err) {
    return next(err);
  }
});

feesRouter.get('/ledger', async (req, res, next) => {
  try {
    const query = z
      .object({
        branchId: ObjectIdString.optional(),
        month: MonthString.optional(),
        status: z.enum(['DUE', 'PAID', 'OVERDUE', 'WAIVED']).optional(),
        studentProfileId: ObjectIdString.optional()
      })
      .parse(req.query);

    const filter: Record<string, unknown> = {};

    if (query.branchId) {
      filter.branchId = query.branchId;
    }

    if (query.month) {
      filter.month = query.month;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.studentProfileId) {
      filter.studentProfileId = query.studentProfileId;
    }

    if (req.user?.role === 'branch_admin') {
      filter.branchId = branchScopedValue(req.user, query.branchId);
    }

    const ledger = await FeeLedger.find(filter)
      .populate('studentProfileId', 'name dob gender photo')
      .populate('branchId', 'name city')
      .populate({
        path: 'enrollmentId',
        populate: {
          path: 'batchId',
          select: 'name schedule monthlyFee'
        }
      })
      .sort({ month: -1, dueDate: 1, createdAt: -1 });

    return sendSuccess(req, res, ledger);
  } catch (err) {
    return next(err);
  }
});

feesRouter.put('/ledger/:id/waive', async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      throw new AppError(403, 'FORBIDDEN', 'Only super admins can waive fees');
    }

    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const ledger = await findLedgerForAdmin(id);

    if (ledger.status === 'PAID') {
      throw new AppError(409, 'INVALID_STATUS', 'Paid fee entries cannot be waived');
    }

    ledger.discount = ledger.amount;
    ledger.finalAmount = 0;
    ledger.status = 'WAIVED';
    await ledger.save();

    await logAudit({
      actorId: req.user!._id,
      action: 'FEE_LEDGER_WAIVED',
      resourceType: 'fee_ledger',
      resourceId: String(ledger._id),
      branchId: String(ledger.branchId),
      payload: { status: 'WAIVED' },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, ledger);
  } catch (err) {
    return next(err);
  }
});

feesRouter.put('/ledger/:id/discount', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = DiscountSchema.parse(req.body);
    const ledger = await findLedgerForAdmin(id);

    return requireBranchAccess(() => String(ledger.branchId))(req, res, async () => {
      try {
        if (ledger.status === 'PAID' || ledger.status === 'WAIVED') {
          throw new AppError(409, 'INVALID_STATUS', 'Discount cannot be changed for paid or waived entries');
        }

        if (payload.discount >= ledger.amount) {
          throw new AppError(409, 'INVALID_DISCOUNT', 'Use waive for a full fee waiver');
        }

        ledger.discount = payload.discount;
        ledger.finalAmount = ledger.amount - payload.discount;
        await ledger.save();

        await logAudit({
          actorId: req.user!._id,
          action: 'FEE_LEDGER_DISCOUNTED',
          resourceType: 'fee_ledger',
          resourceId: String(ledger._id),
          branchId: String(ledger.branchId),
          payload,
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });

        return sendSuccess(req, res, ledger);
      } catch (error) {
        return next(error);
      }
    });
  } catch (err) {
    return next(err);
  }
});
