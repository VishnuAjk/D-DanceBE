import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function demoReadOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isDemo || SAFE_METHODS.has(req.method)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    data: null,
    error: {
      code: 'DEMO_READ_ONLY',
      message: 'This demo account is read-only. No changes were saved.'
    },
    meta: {
      requestId: (req.headers['x-request-id'] as string) || 'N/A',
      timestamp: new Date().toISOString()
    }
  });
}
