import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../models/AuditLog';
import { Batch } from '../../models/Batch';
import { Child } from '../../models/Child';
import { Enrollment } from '../../models/Enrollment';
import { notifyBranchAdminsEnrollmentSubmitted } from '../../services/notifications';
import { sendSuccess } from '../../utils/response';

export const enrollmentsRouter: ExpressRouter = Router();
export const enrollRouter: ExpressRouter = Router();

const CreateEnrollmentSchema = z.object({
  childId: ObjectIdString,
  batchId: ObjectIdString
});

async function findOwnedChild(childId: string, parentId: string) {
  const child = await Child.findOne({ _id: childId, parentId, isActive: true });

  if (!child) {
    throw new AppError(404, 'NOT_FOUND', 'Child not found');
  }

  return child;
}

enrollRouter.post('/', async (req, res, next) => {
  try {
    const payload = CreateEnrollmentSchema.parse(req.body);
    await findOwnedChild(payload.childId, req.user!.userId);

    const batch = await Batch.findOne({ _id: payload.batchId, isActive: true });

    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Batch not found');
    }

    const existingEnrollment = await Enrollment.findOne({
      childId: payload.childId,
      batchId: payload.batchId,
      status: { $in: ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'] }
    });

    if (existingEnrollment) {
      throw new AppError(
        409,
        'ENROLLMENT_EXISTS',
        'An active enrollment request already exists for this child and batch'
      );
    }

    const enrollment = await Enrollment.create({
      childId: payload.childId,
      batchId: payload.batchId,
      branchId: batch.branchId,
      status: 'PENDING'
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'ENROLLMENT_SUBMITTED',
      resourceType: 'enrollment',
      resourceId: String(enrollment._id),
      branchId: String(batch.branchId),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    const child = await Child.findById(payload.childId).select('name');
    if (child) {
      void notifyBranchAdminsEnrollmentSubmitted(String(batch.branchId), child.name);
    }

    return sendSuccess(req, res, enrollment, 201);
  } catch (err) {
    return next(err);
  }
});

enrollmentsRouter.get('/', async (req, res, next) => {
  try {
    const children = await Child.find({
      parentId: req.user!.userId,
      isActive: true
    }).select('_id');
    const childIds = children.map((child) => child._id);

    const enrollments = await Enrollment.find({ childId: { $in: childIds } })
      .populate('childId', 'name dob gender photo')
      .populate('batchId', 'name schedule monthlyFee')
      .populate('branchId', 'name city')
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, enrollments);
  } catch (err) {
    return next(err);
  }
});
