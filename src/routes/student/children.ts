import { Gender, ISODateString, ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../models/AuditLog';
import { Child } from '../../models/Child';
import { Enrollment } from '../../models/Enrollment';
import { sendSuccess } from '../../utils/response';

export const childrenRouter: ExpressRouter = Router();

const CreateChildSchema = z.object({
  name: z.string().min(2).max(100),
  dob: ISODateString,
  gender: Gender,
  photo: z.string().url().optional()
});

const UpdateChildSchema = CreateChildSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

async function findOwnedChild(childId: string, parentId: string) {
  const child = await Child.findOne({ _id: childId, parentId, isActive: true });

  if (!child) {
    throw new AppError(404, 'NOT_FOUND', 'Child not found');
  }

  return child;
}

childrenRouter.get('/', async (req, res, next) => {
  try {
    const children = await Child.find({
      parentId: req.user!.userId,
      isActive: true
    }).sort({ createdAt: -1 });

    return sendSuccess(req, res, children);
  } catch (err) {
    return next(err);
  }
});

childrenRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const child = await findOwnedChild(id, req.user!.userId);

    return sendSuccess(req, res, child);
  } catch (err) {
    return next(err);
  }
});

childrenRouter.post('/', async (req, res, next) => {
  try {
    const payload = CreateChildSchema.parse(req.body);

    const child = await Child.create({
      ...payload,
      dob: new Date(payload.dob),
      parentId: req.user!.userId
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'CHILD_CREATED',
      resourceType: 'child',
      resourceId: String(child._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, child, 201);
  } catch (err) {
    return next(err);
  }
});

childrenRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = UpdateChildSchema.parse(req.body);
    await findOwnedChild(id, req.user!.userId);

    const nextChild = await Child.findOneAndUpdate(
      { _id: id, parentId: req.user!.userId, isActive: true },
      payload.dob ? { ...payload, dob: new Date(payload.dob) } : payload,
      { new: true, runValidators: true }
    );

    await logAudit({
      actorId: req.user!._id,
      action: 'CHILD_UPDATED',
      resourceType: 'child',
      resourceId: id,
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, nextChild);
  } catch (err) {
    return next(err);
  }
});

childrenRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    await findOwnedChild(id, req.user!.userId);

    const activeEnrollment = await Enrollment.exists({
      childId: id,
      status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED'] }
    });

    if (activeEnrollment) {
      throw new AppError(
        409,
        'ACTIVE_ENROLLMENTS_EXIST',
        'This child has active enrollments and cannot be removed'
      );
    }

    const child = await Child.findOneAndUpdate(
      { _id: id, parentId: req.user!.userId, isActive: true },
      { isActive: false },
      { new: true, runValidators: true }
    );

    await logAudit({
      actorId: req.user!._id,
      action: 'CHILD_DEACTIVATED',
      resourceType: 'child',
      resourceId: id,
      payload: { isActive: false },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, child);
  } catch (err) {
    return next(err);
  }
});
