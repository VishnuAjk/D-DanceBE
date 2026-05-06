import { ISODateString, ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Assessment } from '../../models/Assessment';
import { Batch } from '../../models/Batch';
import { Enrollment } from '../../models/Enrollment';
import { notifyParentAssessmentShared } from '../../services/notifications';
import { sendSuccess } from '../../utils/response';

export const assessmentsRouter: ExpressRouter = Router();

const SkillScoreSchema = z.object({
  skill: z.string().min(1).max(80),
  score: z.number().min(0).max(100),
  notes: z.string().max(200).optional()
});

const CreateAssessmentSchema = z.object({
  childId: ObjectIdString,
  batchId: ObjectIdString,
  assessedAt: ISODateString.optional(),
  overallScore: z.number().min(0).max(100).optional(),
  remarks: z.string().max(500).optional(),
  skillScores: z.array(SkillScoreSchema).max(20).optional()
});

const UpdateAssessmentSchema = CreateAssessmentSchema.omit({ childId: true, batchId: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

const ISO_MONTH = z.string().regex(/^\d{4}-\d{2}$/);

function startOfMonthUtc(month: string) {
  const [year, mm] = month.split('-').map((value) => Number(value));
  return new Date(Date.UTC(year, (mm || 1) - 1, 1, 0, 0, 0, 0));
}

function endOfMonthUtc(month: string) {
  const [year, mm] = month.split('-').map((value) => Number(value));
  const next = new Date(Date.UTC(year, mm || 1, 1, 0, 0, 0, 0));
  return new Date(next.getTime() - 1);
}

async function findInstructorBatch(batchId: string, userId: string, isSuperAdmin: boolean) {
  const filter = isSuperAdmin ? { _id: batchId } : { _id: batchId, instructorIds: userId };
  const batch = await Batch.findOne(filter).select('_id branchId levelId instructorIds');

  if (!batch) {
    throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  }

  return batch;
}

async function assertChildInBatch(childId: string, batchId: string) {
  const exists = await Enrollment.exists({
    childId,
    batchId,
    status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED'] }
  });

  if (!exists) {
    throw new AppError(400, 'INVALID_CHILD', 'Child is not enrolled in this batch');
  }
}

assessmentsRouter.post('/', async (req, res, next) => {
  try {
    const payload = CreateAssessmentSchema.parse(req.body);
    const isSuperAdmin = req.user?.role === 'super_admin';
    const batch = await findInstructorBatch(payload.batchId, req.user!._id, isSuperAdmin);
    await assertChildInBatch(payload.childId, payload.batchId);

    const assessment = await Assessment.create({
      childId: payload.childId,
      batchId: payload.batchId,
      branchId: batch.branchId,
      levelId: batch.levelId,
      assessedBy: req.user!._id,
      assessedAt: payload.assessedAt ? new Date(`${payload.assessedAt}T00:00:00.000Z`) : new Date(),
      overallScore: payload.overallScore,
      remarks: payload.remarks,
      skillScores: payload.skillScores ?? []
    });

    return sendSuccess(req, res, assessment, 201);
  } catch (err) {
    return next(err);
  }
});

assessmentsRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = UpdateAssessmentSchema.parse(req.body);

    const existing = await Assessment.findById(id).select('_id assessedBy batchId');
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Assessment not found');
    }

    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin && String(existing.assessedBy) !== req.user!._id) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot edit this assessment');
    }

    if (payload.assessedAt) {
      (payload as Record<string, unknown>).assessedAt = new Date(`${payload.assessedAt}T00:00:00.000Z`);
    }

    const updated = await Assessment.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    });

    return sendSuccess(req, res, updated);
  } catch (err) {
    return next(err);
  }
});

assessmentsRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        batchId: ObjectIdString.optional(),
        month: ISO_MONTH.optional()
      })
      .parse(req.query);

    const isSuperAdmin = req.user?.role === 'super_admin';
    const filter: Record<string, unknown> = {};

    if (query.batchId) {
      await findInstructorBatch(query.batchId, req.user!._id, isSuperAdmin);
      filter.batchId = query.batchId;
    } else if (!isSuperAdmin) {
      const batches = await Batch.find({ instructorIds: req.user!._id }).select('_id');
      filter.batchId = { $in: batches.map((b) => b._id) };
    }

    if (query.month) {
      filter.assessedAt = { $gte: startOfMonthUtc(query.month), $lte: endOfMonthUtc(query.month) };
    }

    const records = await Assessment.find(filter)
      .populate('childId', 'name dob gender photo')
      .populate('batchId', 'name')
      .sort({ assessedAt: -1, createdAt: -1 });

    return sendSuccess(req, res, records);
  } catch (err) {
    return next(err);
  }
});

assessmentsRouter.put('/:id/share', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);

    const existing = await Assessment.findById(id).select('_id assessedBy batchId');
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Assessment not found');
    }

    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin && String(existing.assessedBy) !== req.user!._id) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot share this assessment');
    }

    const updated = await Assessment.findByIdAndUpdate(
      id,
      { sharedWithParent: true, sharedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (updated) {
      void notifyParentAssessmentShared(String(updated.childId));
    }

    return sendSuccess(req, res, updated);
  } catch (err) {
    return next(err);
  }
});
