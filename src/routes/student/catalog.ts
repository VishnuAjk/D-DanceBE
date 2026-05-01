import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { Batch } from '../../models/Batch';
import { Branch } from '../../models/Branch';
import { sendSuccess } from '../../utils/response';

export const catalogRouter: ExpressRouter = Router();

catalogRouter.get('/branches', async (req, res, next) => {
  try {
    const branches = await Branch.find({ isActive: true })
      .select('_id name city')
      .sort({ name: 1 });

    return sendSuccess(req, res, branches);
  } catch (err) {
    return next(err);
  }
});

catalogRouter.get('/batches', async (req, res, next) => {
  try {
    const query = z
      .object({
        branchId: ObjectIdString.optional(),
        courseId: ObjectIdString.optional()
      })
      .parse(req.query);

    const filter: Record<string, unknown> = { isActive: true };

    if (query.branchId) {
      filter.branchId = query.branchId;
    }

    if (query.courseId) {
      filter.courseId = query.courseId;
    }

    const batches = await Batch.find(filter)
      .populate('branchId', 'name city')
      .populate('courseId', 'name')
      .populate('levelId', 'name order')
      .sort({ name: 1 });

    return sendSuccess(req, res, batches);
  } catch (err) {
    return next(err);
  }
});
