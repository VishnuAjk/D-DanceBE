import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { requireBranchAccess } from '../../middleware/rbac';
import { AgeGroup } from '../../models/AgeGroup';
import { logAudit } from '../../models/AuditLog';
import { Batch } from '../../models/Batch';
import { Branch } from '../../models/Branch';
import { Course } from '../../models/Course';
import { Enrollment } from '../../models/Enrollment';
import { Level } from '../../models/Level';
import { User } from '../../models/User';
import { assertBranchScope, branchScopedValue } from '../../utils/branchScope';
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

interface BatchReferences {
  branchId: string;
  courseId: string;
  levelId?: string;
  ageGroupId?: string;
  instructorIds: string[];
}

function invalidBatchReference(message: string) {
  return new AppError(422, 'INVALID_BATCH_REFERENCE', message);
}

async function assertValidBatchReferences(references: BatchReferences) {
  const instructorIds = Array.from(new Set(references.instructorIds));
  const [branch, course, level, ageGroup, instructorCount] = await Promise.all([
    Branch.exists({ _id: references.branchId, isActive: true }),
    Course.exists({ _id: references.courseId, isActive: true }),
    references.levelId
      ? Level.exists({ _id: references.levelId, courseId: references.courseId })
      : Promise.resolve(null),
    references.ageGroupId
      ? AgeGroup.exists({ _id: references.ageGroupId })
      : Promise.resolve(null),
    instructorIds.length > 0
      ? User.countDocuments({
          _id: { $in: instructorIds },
          role: 'instructor',
          status: 'active',
          branchIds: references.branchId
        })
      : Promise.resolve(0)
  ]);

  if (!branch) {
    throw invalidBatchReference('Branch is missing or inactive');
  }

  if (!course) {
    throw invalidBatchReference('Course is missing or inactive');
  }

  if (references.levelId && !level) {
    throw invalidBatchReference('Level does not belong to the selected course');
  }

  if (references.ageGroupId && !ageGroup) {
    throw invalidBatchReference('Age group was not found');
  }

  if (instructorCount !== instructorIds.length) {
    throw invalidBatchReference(
      'Instructors must be active instructor users assigned to the selected branch'
    );
  }
}

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
      filter.branchId = branchScopedValue(req.user, query.branchId);
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
      await assertValidBatchReferences(payload);
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
    const payload = UpdateBatchSchema.parse(req.body);
    const existingBatch = await Batch.findById(id).lean();

    if (!existingBatch) {
      throw new AppError(404, 'NOT_FOUND', 'Batch not found');
    }

    const sourceBranchId = String(existingBatch.branchId);
    assertBranchScope(req.user!, sourceBranchId);

    const targetBranchId = payload.branchId ?? sourceBranchId;
    if (targetBranchId !== sourceBranchId) {
      assertBranchScope(req.user!, targetBranchId);
    }

    await assertValidBatchReferences({
      branchId: targetBranchId,
      courseId: payload.courseId ?? String(existingBatch.courseId),
      levelId: payload.levelId ?? existingBatch.levelId?.toString(),
      ageGroupId: payload.ageGroupId ?? existingBatch.ageGroupId?.toString(),
      instructorIds:
        payload.instructorIds ?? existingBatch.instructorIds.map((instructorId) => String(instructorId))
    });

    const batch = await Batch.findOneAndUpdate(
      { _id: id, branchId: existingBatch.branchId },
      payload,
      {
        new: true,
        runValidators: true
      }
    );

    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Batch not found');
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
            .populate('studentProfileId', 'name dob gender photo')
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
