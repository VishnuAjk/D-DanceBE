import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Assessment } from '../../models/Assessment';
import { StudentProfile } from '../../models/StudentProfile';
import { sendSuccess } from '../../utils/response';

export const assessmentsRouter: ExpressRouter = Router();

assessmentsRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        studentProfileId: ObjectIdString.optional(),
        childId: ObjectIdString.optional()
      })
      .transform((value) => ({
        studentProfileId: value.studentProfileId ?? value.childId
      }))
      .refine((value) => Boolean(value.studentProfileId), {
        message: 'Student profile is required',
        path: ['studentProfileId']
      })
      .parse(req.query);

    const studentProfile = await StudentProfile.findOne({
      _id: query.studentProfileId,
      customerId: req.user!.userId,
      isActive: true
    }).select('_id');

    if (!studentProfile) {
      throw new AppError(404, 'NOT_FOUND', 'Student profile not found');
    }

    const records = await Assessment.find({
      studentProfileId: query.studentProfileId,
      sharedWithCustomer: true
    })
      .populate('batchId', 'name')
      .sort({ assessedAt: -1, createdAt: -1 });

    return sendSuccess(req, res, records);
  } catch (err) {
    return next(err);
  }
});
