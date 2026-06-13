import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Batch } from '../../models/Batch';
import { Enrollment } from '../../models/Enrollment';
import { sendSuccess } from '../../utils/response';

export const batchesRouter: ExpressRouter = Router();

async function findInstructorBatch(batchId: string, userId: string, isSuperAdmin: boolean) {
  const filter = isSuperAdmin
    ? { _id: batchId }
    : { _id: batchId, instructorIds: userId };

  const batch = await Batch.findOne(filter)
    .populate('branchId', 'name city')
    .populate('courseId', 'name')
    .populate('levelId', 'name order')
    .populate('ageGroupId', 'label minAge maxAge')
    .populate('instructorIds', 'name phone');

  if (!batch) {
    throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  }

  return batch;
}

batchesRouter.get('/', async (req, res, next) => {
  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    const filter = isSuperAdmin ? {} : { instructorIds: req.user!._id };

    const batches = await Batch.find(filter)
      .populate('branchId', 'name city')
      .populate('courseId', 'name')
      .populate('levelId', 'name order')
      .populate('ageGroupId', 'label minAge maxAge')
      .sort({ name: 1 });

    return sendSuccess(req, res, batches);
  } catch (err) {
    return next(err);
  }
});

batchesRouter.get('/:id/roster', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const isSuperAdmin = req.user?.role === 'super_admin';
    const batch = await findInstructorBatch(id, req.user!._id, isSuperAdmin);

    const roster = await Enrollment.find({
      batchId: id,
      status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED'] }
    })
      .populate('studentProfileId', 'name dob gender photo')
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, {
      batch,
      roster
    });
  } catch (err) {
    return next(err);
  }
});
