import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireBranchAccess } from '../../middleware/rbac';
import { logAudit } from '../../models/AuditLog';
import { Batch } from '../../models/Batch';
import { Enrollment } from '../../models/Enrollment';
import { sendSuccess } from '../../utils/response';

export const batchesRouter: ExpressRouter = Router();

const CreateBatchSchema = z.object({
  name: z.string().min(2),
  branchId: ObjectIdString,
  courseId: ObjectIdString,
  levelId: ObjectIdString.optional(),
  ageGroupId: ObjectIdString.optional(),
  instructorIds: z.array(ObjectIdString).default([]),
  schedule: z.object({
    days: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/)
  }),
  capacity: z.number().int().positive(),
  monthlyFee: z.number().positive(),
  isActive: z.boolean().optional()
});

const UpdateBatchSchema = CreateBatchSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

batchesRouter.get('/', async (req, res, next) => {
  try {
    const querySchema = z.object({
      branchId: ObjectIdString.optional(),
      courseId: ObjectIdString.optional(),
      isActive: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .optional()
    });

    const query = querySchema.parse(req.query);
    const filter: Record<string, unknown> = {};

    if (query.branchId) {
      filter.branchId = query.branchId;
    }

    if (query.courseId) {
      filter.courseId = query.courseId;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (req.user?.role === 'branch_admin') {
      filter.branchId = {
        $in: query.branchId ? [query.branchId] : req.user.branchIds
      };
    }

    const batches = await Batch.find(filter)
      .populate('branchId', 'name city')
      .populate('courseId', 'name')
      .populate('levelId', 'name order')
      .populate('ageGroupId', 'label minAge maxAge')
      .populate('instructorIds', 'name phone')
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, batches);
  } catch (err) {
    return next(err);
  }
});

batchesRouter.post(
  '/',
  requireBranchAccess((req) => String(req.body?.branchId || '')),
  async (req, res, next) => {
    try {
      const payload = CreateBatchSchema.parse(req.body);
      const batch = await Batch.create(payload);

      await logAudit({
        actorId: req.user!._id,
        action: 'BATCH_CREATED',
        resourceType: 'batch',
        resourceId: String(batch._id),
        branchId: String(batch.branchId),
        payload,
        ip: req.ip,
        requestId: req.headers['x-request-id'] as string | undefined
      });

      return sendSuccess(req, res, batch, 201);
    } catch (err) {
      return next(err);
    }
  }
);

batchesRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const existingBatch = await Batch.findById(id).lean();

    if (!existingBatch) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Batch not found' },
        meta: {
          requestId: req.headers['x-request-id'] || 'N/A',
          timestamp: new Date().toISOString()
        }
      });
    }

    const targetBranchId = String(req.body?.branchId || existingBatch.branchId);

    return requireBranchAccess(() => targetBranchId)(req, res, async () => {
      try {
        const payload = UpdateBatchSchema.parse(req.body);
        const batch = await Batch.findByIdAndUpdate(id, payload, {
          new: true,
          runValidators: true
        });

        if (!batch) {
          return res.status(404).json({
            success: false,
            data: null,
            error: { code: 'NOT_FOUND', message: 'Batch not found' },
            meta: {
              requestId: req.headers['x-request-id'] || 'N/A',
              timestamp: new Date().toISOString()
            }
          });
        }

        await logAudit({
          actorId: req.user!._id,
          action: 'BATCH_UPDATED',
          resourceType: 'batch',
          resourceId: String(batch._id),
          branchId: String(batch.branchId),
          payload,
          ip: req.ip,
          requestId: req.headers['x-request-id'] as string | undefined
        });

        return sendSuccess(req, res, batch);
      } catch (err) {
        return next(err);
      }
    });
  } catch (err) {
    return next(err);
  }
});

batchesRouter.get(
  '/:id/roster',
  async (req, res, next) => {
    try {
      const { id } = z.object({ id: ObjectIdString }).parse(req.params);
      const batch = await Batch.findById(id).lean();

      if (!batch) {
        return res.status(404).json({
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Batch not found' },
          meta: {
            requestId: req.headers['x-request-id'] || 'N/A',
            timestamp: new Date().toISOString()
          }
        });
      }

      return requireBranchAccess(() => String(batch.branchId))(req, res, async () => {
        try {
          const roster = await Enrollment.find({
            batchId: id,
            status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED'] }
          })
            .populate('childId', 'name dob gender photo')
            .sort({ createdAt: -1 });

          return sendSuccess(req, res, roster);
        } catch (err) {
          return next(err);
        }
      });
    } catch (err) {
      return next(err);
    }
  }
);
