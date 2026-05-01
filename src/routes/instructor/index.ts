import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { attendanceRouter } from './attendance';
import { assessmentsRouter } from './assessments';
import { batchesRouter } from './batches';

export const instructorRouter: ExpressRouter = Router();

instructorRouter.use(authenticate);
instructorRouter.use(requireRole('instructor', 'super_admin'));
instructorRouter.use('/batches', batchesRouter);
instructorRouter.use('/attendance', attendanceRouter);
instructorRouter.use('/assessments', assessmentsRouter);
