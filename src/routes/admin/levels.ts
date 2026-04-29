import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { logAudit } from '../../models/AuditLog';
import { Level } from '../../models/Level';
import { sendSuccess } from '../../utils/response';

export const levelsRouter: ExpressRouter = Router();

const LevelUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    order: z.number().int().min(0).optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

levelsRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = LevelUpdateSchema.parse(req.body);

    const level = await Level.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    });

    if (!level) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Level not found' },
        meta: {
          requestId: req.headers['x-request-id'] || 'N/A',
          timestamp: new Date().toISOString()
        }
      });
    }

    await logAudit({
      actorId: req.user!._id,
      action: 'LEVEL_UPDATED',
      resourceType: 'level',
      resourceId: String(level._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, level);
  } catch (err) {
    return next(err);
  }
});
