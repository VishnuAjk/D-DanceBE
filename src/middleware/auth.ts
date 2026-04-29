/* eslint-disable @typescript-eslint/no-namespace */
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { _id: string };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      meta: {
        requestId: req.headers['x-request-id'],
        timestamp: new Date().toISOString()
      }
    });
  }

  try {
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    req.user = { ...payload, _id: payload.userId };
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: 'TOKEN_EXPIRED', message: 'Access token is invalid or expired' },
      meta: {
        requestId: req.headers['x-request-id'],
        timestamp: new Date().toISOString()
      }
    });
  }
}
