import type { NextFunction, Request, Response } from 'express';
import type { UserRoleType } from '@danceapp/shared';

function errorMeta(req: Request) {
  return {
    requestId: (req.headers['x-request-id'] as string) || 'N/A',
    timestamp: new Date().toISOString()
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      },
      meta: errorMeta(req)
    });
  }

  return next();
}

export function requireRole(...roles: UserRoleType[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as UserRoleType)) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: `Requires one of: ${roles.join(', ')}`
        },
        meta: errorMeta(req)
      });
    }

    return next();
  };
}

export function requireBranchAccess(getBranchId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const branchId = getBranchId(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        },
        meta: errorMeta(req)
      });
    }

    if (!branchId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'BRANCH_ID_REQUIRED',
          message: 'Branch identifier is required'
        },
        meta: errorMeta(req)
      });
    }

    if (user.role === 'super_admin') {
      return next();
    }

    if (!user.branchIds.includes(branchId)) {
      return res.status(403).json({
        success: false,
        data: null,
        error: {
          code: 'BRANCH_ACCESS_DENIED',
          message: 'You do not have access to this branch'
        },
        meta: errorMeta(req)
      });
    }

    return next();
  };
}
