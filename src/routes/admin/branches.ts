import { ObjectIdString, PhoneNumber } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireBranchAccess, requireRole } from '../../middleware/rbac';
import { logAudit } from '../../models/AuditLog';
import { Branch } from '../../models/Branch';
import { sendSuccess } from '../../utils/response';

export const branchesRouter: ExpressRouter = Router();

const BranchBodySchema = z.object({
  name: z.string().min(2).max(100),
  address: z.string().min(5).max(300),
  city: z.string().min(2).max(100).optional(),
  phone: PhoneNumber.optional()
});

const BranchUpdateSchema = BranchBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

branchesRouter.get('/', requireRole('super_admin'), async (req, res, next) => {
  try {
    const branches = await Branch.find().sort({ createdAt: -1 });
    return sendSuccess(req, res, branches);
  } catch (err) {
    return next(err);
  }
});

branchesRouter.post('/', requireRole('super_admin'), async (req, res, next) => {
  try {
    const payload = BranchBodySchema.parse(req.body);
    const branch = await Branch.create(payload);

    await logAudit({
      actorId: req.user!._id,
      action: 'BRANCH_CREATED',
      resourceType: 'branch',
      resourceId: String(branch._id),
      branchId: String(branch._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, branch, 201);
  } catch (err) {
    return next(err);
  }
});

branchesRouter.put(
  '/:id',
  requireBranchAccess((req) => req.params.id),
  async (req, res, next) => {
    try {
      const { id } = z.object({ id: ObjectIdString }).parse(req.params);
      const payload = BranchUpdateSchema.parse(req.body);

      const branch = await Branch.findByIdAndUpdate(id, payload, {
        new: true,
        runValidators: true
      });

      if (!branch) {
        return res.status(404).json({
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Branch not found' },
          meta: {
            requestId: req.headers['x-request-id'] || 'N/A',
            timestamp: new Date().toISOString()
          }
        });
      }

      await logAudit({
        actorId: req.user!._id,
        action: 'BRANCH_UPDATED',
        resourceType: 'branch',
        resourceId: String(branch._id),
        branchId: String(branch._id),
        payload,
        ip: req.ip,
        requestId: req.headers['x-request-id'] as string | undefined
      });

      return sendSuccess(req, res, branch);
    } catch (err) {
      return next(err);
    }
  }
);

branchesRouter.delete(
  '/:id',
  requireBranchAccess((req) => req.params.id),
  async (req, res, next) => {
    try {
      const { id } = z.object({ id: ObjectIdString }).parse(req.params);
      const branch = await Branch.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true, runValidators: true }
      );

      if (!branch) {
        return res.status(404).json({
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Branch not found' },
          meta: {
            requestId: req.headers['x-request-id'] || 'N/A',
            timestamp: new Date().toISOString()
          }
        });
      }

      await logAudit({
        actorId: req.user!._id,
        action: 'BRANCH_DEACTIVATED',
        resourceType: 'branch',
        resourceId: String(branch._id),
        branchId: String(branch._id),
        payload: { isActive: false },
        ip: req.ip,
        requestId: req.headers['x-request-id'] as string | undefined
      });

      return sendSuccess(req, res, branch);
    } catch (err) {
      return next(err);
    }
  }
);
