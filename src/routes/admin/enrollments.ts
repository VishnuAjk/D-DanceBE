import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { requireBranchAccess } from '../../middleware/rbac';
import { logAudit } from '../../models/AuditLog';
import { Batch } from '../../models/Batch';
import { Enrollment } from '../../models/Enrollment';
import { FeeLedger } from '../../models/FeeLedger';
import { notifyParentEnrollmentApproved, notifyParentEnrollmentRejected } from '../../services/notifications';
import { sendSuccess } from '../../utils/response';

export const enrollmentsRouter: ExpressRouter = Router();

function currentMonthString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function currentMonthDueDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 10);
}

async function findEnrollmentForAdmin(enrollmentId: string) {
  const enrollment = await Enrollment.findById(enrollmentId).populate('batchId', 'monthlyFee branchId');

  if (!enrollment) {
    throw new AppError(404, 'NOT_FOUND', 'Enrollment not found');
  }

  return enrollment;
}

enrollmentsRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        status: z.enum(['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
        branchId: ObjectIdString.optional(),
        batchId: ObjectIdString.optional()
      })
      .parse(req.query);

    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.branchId) {
      filter.branchId = query.branchId;
    }

    if (query.batchId) {
      filter.batchId = query.batchId;
    }

    if (req.user?.role === 'branch_admin') {
      filter.branchId = {
        $in: query.branchId ? [query.branchId] : req.user.branchIds
      };
    }

    const enrollments = await Enrollment.find(filter)
      .populate('childId', 'name dob gender photo')
      .populate('batchId', 'name schedule monthlyFee')
      .populate('branchId', 'name city')
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, enrollments);
  } catch (err) {
    return next(err);
  }
});

enrollmentsRouter.put('/:id/approve', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const enrollment = await findEnrollmentForAdmin(id);

    return requireBranchAccess(() => String(enrollment.branchId))(req, res, async () => {
      try {
        if (!['PENDING', 'SUSPENDED'].includes(enrollment.status)) {
          throw new AppError(409, 'INVALID_STATUS', 'Only pending or suspended enrollments can be approved');
        }

        enrollment.status = 'APPROVED';
        enrollment.approvedBy = req.user!._id as never;
        enrollment.approvedAt = new Date();
        enrollment.joinDate = enrollment.joinDate ?? new Date();
        await enrollment.save();

        const batch = await Batch.findById(enrollment.batchId).select('monthlyFee');

        if (batch) {
          await FeeLedger.findOneAndUpdate(
            {
              enrollmentId: enrollment._id,
              month: currentMonthString()
            },
            {
              enrollmentId: enrollment._id,
              childId: enrollment.childId,
              branchId: enrollment.branchId,
              month: currentMonthString(),
              amount: batch.monthlyFee,
              discount: 0,
              finalAmount: batch.monthlyFee,
              status: 'DUE',
              dueDate: currentMonthDueDate()
            },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
          );
        }

        await logAudit({
          actorId: req.user!._id,
          action: 'ENROLLMENT_APPROVED',
          resourceType: 'enrollment',
          resourceId: String(enrollment._id),
          branchId: String(enrollment.branchId),
          payload: { status: 'APPROVED' },
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });

        void notifyParentEnrollmentApproved(String(enrollment.childId));

        return sendSuccess(req, res, enrollment);
      } catch (err) {
        return next(err);
      }
    });
  } catch (err) {
    return next(err);
  }
});

enrollmentsRouter.put('/:id/reject', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const enrollment = await findEnrollmentForAdmin(id);

    return requireBranchAccess(() => String(enrollment.branchId))(req, res, async () => {
      try {
        if (enrollment.status !== 'PENDING') {
          throw new AppError(409, 'INVALID_STATUS', 'Only pending enrollments can be rejected');
        }

        enrollment.status = 'CANCELLED';
        await enrollment.save();

        await logAudit({
          actorId: req.user!._id,
          action: 'ENROLLMENT_REJECTED',
          resourceType: 'enrollment',
          resourceId: String(enrollment._id),
          branchId: String(enrollment.branchId),
          payload: { status: 'CANCELLED' },
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });

        void notifyParentEnrollmentRejected(String(enrollment.childId));

        return sendSuccess(req, res, enrollment);
      } catch (err) {
        return next(err);
      }
    });
  } catch (err) {
    return next(err);
  }
});

enrollmentsRouter.put('/:id/suspend', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const enrollment = await findEnrollmentForAdmin(id);

    return requireBranchAccess(() => String(enrollment.branchId))(req, res, async () => {
      try {
        if (!['APPROVED', 'ACTIVE'].includes(enrollment.status)) {
          throw new AppError(409, 'INVALID_STATUS', 'Only approved or active enrollments can be suspended');
        }

        enrollment.status = 'SUSPENDED';
        await enrollment.save();

        await logAudit({
          actorId: req.user!._id,
          action: 'ENROLLMENT_SUSPENDED',
          resourceType: 'enrollment',
          resourceId: String(enrollment._id),
          branchId: String(enrollment.branchId),
          payload: { status: 'SUSPENDED' },
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });

        return sendSuccess(req, res, enrollment);
      } catch (err) {
        return next(err);
      }
    });
  } catch (err) {
    return next(err);
  }
});
