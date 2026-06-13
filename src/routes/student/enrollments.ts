import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../models/AuditLog';
import { Batch } from '../../models/Batch';
import { StudentProfile } from '../../models/StudentProfile';
import { Enrollment } from '../../models/Enrollment';
import { notifyBranchAdminsEnrollmentSubmitted } from '../../services/notifications';
import { sendSuccess } from '../../utils/response';

export const enrollmentsRouter: ExpressRouter = Router();
export const enrollRouter: ExpressRouter = Router();

const CreateEnrollmentSchema = z
  .object({
    studentProfileId: ObjectIdString.optional(),
    childId: ObjectIdString.optional(),
    batchId: ObjectIdString
  })
  .transform((value) => ({
    studentProfileId: value.studentProfileId ?? value.childId,
    batchId: value.batchId
  }))
  .refine((value) => Boolean(value.studentProfileId), {
    message: 'Student profile is required',
    path: ['studentProfileId']
  });

async function findOwnedStudentProfile(studentProfileId: string, customerId: string) {
  const studentProfile = await StudentProfile.findOne({ _id: studentProfileId, customerId, isActive: true });

  if (!studentProfile) {
    throw new AppError(404, 'NOT_FOUND', 'Student profile not found');
  }

  return studentProfile;
}

enrollRouter.post('/', async (req, res, next) => {
  try {
    const payload = CreateEnrollmentSchema.parse(req.body);
    await findOwnedStudentProfile(payload.studentProfileId!, req.user!.userId);

    const batch = await Batch.findOne({ _id: payload.batchId, isActive: true });

    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Batch not found');
    }

    const existingEnrollment = await Enrollment.findOne({
      studentProfileId: payload.studentProfileId!,
      batchId: payload.batchId,
      status: { $in: ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'] }
    });

    if (existingEnrollment) {
      throw new AppError(
        409,
        'ENROLLMENT_EXISTS',
        'An active enrollment request already exists for this student profile and batch'
      );
    }

    const enrollment = await Enrollment.create({
      studentProfileId: payload.studentProfileId!,
      batchId: payload.batchId,
      branchId: batch.branchId,
      status: 'PENDING'
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'ENROLLMENT_SUBMITTED',
      resourceType: 'enrollment',
      resourceId: String(enrollment._id),
      branchId: String(batch.branchId),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    const studentProfile = await StudentProfile.findById(payload.studentProfileId).select('name');
    if (studentProfile) {
      void notifyBranchAdminsEnrollmentSubmitted(String(batch.branchId), studentProfile.name);
    }

    return sendSuccess(req, res, enrollment, 201);
  } catch (err) {
    return next(err);
  }
});

enrollmentsRouter.get('/', async (req, res, next) => {
  try {
    const studentProfiles = await StudentProfile.find({
      customerId: req.user!.userId,
      isActive: true
    }).select('_id');
    const studentProfileIds = studentProfiles.map((studentProfile) => studentProfile._id);

    const enrollments = await Enrollment.find({ studentProfileId: { $in: studentProfileIds } })
      .populate('studentProfileId', 'name dob gender photo')
      .populate('batchId', 'name schedule monthlyFee')
      .populate('branchId', 'name city')
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, enrollments);
  } catch (err) {
    return next(err);
  }
});
