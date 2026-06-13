import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { dashboardRouter } from './dashboard';
import { catalogRouter } from './catalog';
import { studentProfilesRouter } from './studentProfiles';
import { enrollRouter, enrollmentsRouter } from './enrollments';
import { feesRouter } from './fees';
import { attendanceRouter } from './attendance';
import { assessmentsRouter } from './assessments';

export const studentRouter: ExpressRouter = Router();

studentRouter.use(authenticate);
studentRouter.use(requireRole('customer', 'parent'));
studentRouter.use('/dashboard', dashboardRouter);
studentRouter.use('/catalog', catalogRouter);
studentRouter.use('/student-profiles', studentProfilesRouter);
studentRouter.use('/children', studentProfilesRouter);
studentRouter.use('/enrollments', enrollmentsRouter);
studentRouter.use('/enroll', enrollRouter);
studentRouter.use('/attendance', attendanceRouter);
studentRouter.use('/assessments', assessmentsRouter);
studentRouter.use('/fees', feesRouter);
