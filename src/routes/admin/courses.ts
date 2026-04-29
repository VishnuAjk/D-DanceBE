import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { logAudit } from '../../models/AuditLog';
import { Course } from '../../models/Course';
import { Level } from '../../models/Level';
import { sendSuccess } from '../../utils/response';

export const coursesRouter: ExpressRouter = Router();

const CourseBodySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional()
});

const CourseUpdateSchema = CourseBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

const LevelBodySchema = z.object({
  name: z.string().min(1).max(120),
  order: z.number().int().min(0)
});

coursesRouter.get('/', async (req, res, next) => {
  try {
    const courses = await Course.find().sort({ name: 1 }).lean();
    const levels = await Level.find().sort({ order: 1, name: 1 }).lean();

    const data = courses.map((course) => ({
      ...course,
      levels: levels.filter((level) => String(level.courseId) === String(course._id))
    }));

    return sendSuccess(req, res, data);
  } catch (err) {
    return next(err);
  }
});

coursesRouter.post('/', async (req, res, next) => {
  try {
    const payload = CourseBodySchema.parse(req.body);
    const course = await Course.create(payload);

    await logAudit({
      actorId: req.user!._id,
      action: 'COURSE_CREATED',
      resourceType: 'course',
      resourceId: String(course._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, course, 201);
  } catch (err) {
    return next(err);
  }
});

coursesRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = CourseUpdateSchema.parse(req.body);
    const course = await Course.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Course not found' },
        meta: {
          requestId: req.headers['x-request-id'] || 'N/A',
          timestamp: new Date().toISOString()
        }
      });
    }

    await logAudit({
      actorId: req.user!._id,
      action: 'COURSE_UPDATED',
      resourceType: 'course',
      resourceId: String(course._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, course);
  } catch (err) {
    return next(err);
  }
});

coursesRouter.post('/:id/levels', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = LevelBodySchema.parse(req.body);
    const courseExists = await Course.exists({ _id: id });

    if (!courseExists) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Course not found' },
        meta: {
          requestId: req.headers['x-request-id'] || 'N/A',
          timestamp: new Date().toISOString()
        }
      });
    }

    const level = await Level.create({ ...payload, courseId: id });

    await logAudit({
      actorId: req.user!._id,
      action: 'LEVEL_CREATED',
      resourceType: 'level',
      resourceId: String(level._id),
      payload: { ...payload, courseId: id },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, level, 201);
  } catch (err) {
    return next(err);
  }
});
