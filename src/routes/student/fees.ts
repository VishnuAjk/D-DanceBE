import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { Child } from '../../models/Child';
import { FeeLedger } from '../../models/FeeLedger';
import { sendSuccess } from '../../utils/response';

export const feesRouter: ExpressRouter = Router();

const MonthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

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
