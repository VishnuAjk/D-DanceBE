import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Assessment } from '../../models/Assessment';
import { Child } from '../../models/Child';
import { sendSuccess } from '../../utils/response';

export const assessmentsRouter: ExpressRouter = Router();

assessmentsRouter.get('/', async (req, res, next) => {
  try {
    const query = z.object({ childId: ObjectIdString }).parse(req.query);

    const child = await Child.findOne({
      _id: query.childId,
      parentId: req.user!.userId,
      isActive: true
    }).select('_id');

    if (!child) {
      throw new AppError(404, 'NOT_FOUND', 'Child not found');
    }

    const records = await Assessment.find({
      childId: query.childId,
      sharedWithParent: true
    })
      .populate('batchId', 'name')
      .sort({ assessedAt: -1, createdAt: -1 });

    return sendSuccess(req, res, records);
  } catch (err) {
    return next(err);
  }
});

