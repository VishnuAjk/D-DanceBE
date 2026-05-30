import { Gender, ISODateString, ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../models/AuditLog';
import { StudentProfile } from '../../models/StudentProfile';
import { Enrollment } from '../../models/Enrollment';
import { sendSuccess } from '../../utils/response';

export const studentProfilesRouter: ExpressRouter = Router();

const CreateStudentProfileSchema = z.object({
  name: z.string().min(2).max(100),
  dob: ISODateString,
  gender: Gender,
  relationshipToCustomer: z.enum(['self', 'child', 'family_member']).default('child'),
  photo: z.string().url().optional()
});

const UpdateStudentProfileSchema = CreateStudentProfileSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

async function findOwnedStudentProfile(studentProfileId: string, customerId: string) {
  const studentProfile = await StudentProfile.findOne({ _id: studentProfileId, customerId, isActive: true });

  if (!studentProfile) {
    throw new AppError(404, 'NOT_FOUND', 'Student profile not found');
  }

  return studentProfile;
}

studentProfilesRouter.get('/', async (req, res, next) => {
  try {
    const studentProfiles = await StudentProfile.find({
      customerId: req.user!.userId,
      isActive: true
    }).sort({ createdAt: -1 });

    return sendSuccess(req, res, studentProfiles);
  } catch (err) {
    return next(err);
  }
});

studentProfilesRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const studentProfile = await findOwnedStudentProfile(id, req.user!.userId);

    return sendSuccess(req, res, studentProfile);
  } catch (err) {
    return next(err);
  }
});

studentProfilesRouter.post('/', async (req, res, next) => {
  try {
    const payload = CreateStudentProfileSchema.parse(req.body);

    const studentProfile = await StudentProfile.create({
      ...payload,
      dob: new Date(payload.dob),
      customerId: req.user!.userId
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'STUDENT_PROFILE_CREATED',
      resourceType: 'studentProfile',
      resourceId: String(studentProfile._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, studentProfile, 201);
  } catch (err) {
    return next(err);
  }
});

studentProfilesRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = UpdateStudentProfileSchema.parse(req.body);
    await findOwnedStudentProfile(id, req.user!.userId);

    const nextStudentProfile = await StudentProfile.findOneAndUpdate(
      { _id: id, customerId: req.user!.userId, isActive: true },
      payload.dob ? { ...payload, dob: new Date(payload.dob) } : payload,
      { new: true, runValidators: true }
    );

    await logAudit({
      actorId: req.user!._id,
      action: 'STUDENT_PROFILE_UPDATED',
      resourceType: 'studentProfile',
      resourceId: id,
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, nextStudentProfile);
  } catch (err) {
    return next(err);
  }
});

studentProfilesRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    await findOwnedStudentProfile(id, req.user!.userId);

    const activeEnrollment = await Enrollment.exists({
      studentProfileId: id,
      status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED'] }
    });

    if (activeEnrollment) {
      throw new AppError(
        409,
        'ACTIVE_ENROLLMENTS_EXIST',
        'This student profile has active enrollments and cannot be removed'
      );
    }

    const studentProfile = await StudentProfile.findOneAndUpdate(
      { _id: id, customerId: req.user!.userId, isActive: true },
      { isActive: false },
      { new: true, runValidators: true }
    );

    await logAudit({
      actorId: req.user!._id,
      action: 'STUDENT_PROFILE_DEACTIVATED',
      resourceType: 'studentProfile',
      resourceId: id,
      payload: { isActive: false },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, studentProfile);
  } catch (err) {
    return next(err);
  }
});
