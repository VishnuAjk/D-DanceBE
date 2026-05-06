import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireAuth } from '../middleware/rbac';
import { Video } from '../models/Video';
import { sendSuccess } from '../utils/response';

export const videosRouter: ExpressRouter = Router();

videosRouter.use(authenticate);
videosRouter.use(requireAuth);

videosRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        courseId: ObjectIdString.optional(),
        levelId: ObjectIdString.optional(),
        tags: z
          .string()
          .optional()
          .transform((value) =>
            value
              ?.split(',')
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean)
          )
      })
      .parse(req.query);

    const filter: Record<string, unknown> = {
      isPublished: true
    };

    if (query.courseId) {
      filter.courseId = query.courseId;
    }

    if (query.levelId) {
      filter.levelId = query.levelId;
    }

    if (query.tags?.length) {
      filter.tags = { $all: query.tags };
    }

    const videos = await Video.find(filter)
      .populate('courseId', 'name')
      .populate('levelId', 'name order')
      .populate('branchIds', 'name city')
      .sort({ publishedAt: -1, createdAt: -1 });

    return sendSuccess(req, res, videos);
  } catch (err) {
    return next(err);
  }
});
