import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { batchesRouter } from './batches';
import { branchesRouter } from './branches';
import { coursesRouter } from './courses';
import { enrollmentsRouter } from './enrollments';
import { feesRouter } from './fees';
import { levelsRouter } from './levels';
import { usersRouter } from './users';

export const adminRouter: ExpressRouter = Router();

adminRouter.use(authenticate);
adminRouter.use('/branches', requireRole('super_admin', 'branch_admin'), branchesRouter);
adminRouter.use('/courses', requireRole('super_admin', 'branch_admin'), coursesRouter);
adminRouter.use('/levels', requireRole('super_admin', 'branch_admin'), levelsRouter);
adminRouter.use('/batches', requireRole('super_admin', 'branch_admin'), batchesRouter);
adminRouter.use('/users', requireRole('super_admin', 'branch_admin'), usersRouter);
adminRouter.use('/enrollments', requireRole('super_admin', 'branch_admin'), enrollmentsRouter);
adminRouter.use('/fees', requireRole('super_admin', 'branch_admin'), feesRouter);
