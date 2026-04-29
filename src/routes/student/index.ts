import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { childrenRouter } from './children';

export const studentRouter: ExpressRouter = Router();

studentRouter.use(authenticate);
studentRouter.use(requireRole('parent'));
studentRouter.use('/children', childrenRouter);
