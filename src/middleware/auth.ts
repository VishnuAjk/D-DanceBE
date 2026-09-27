/* eslint-disable @typescript-eslint/no-namespace */
import type { NextFunction, Request, Response } from 'express';
import { isDemoAccount } from '../config/demo';
import { User } from '../models/User';
import { verifyAccessToken, type JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { _id: string };
    }
  }
}

function sendAuthenticationError(
  req: Request,
  res: Response,
  code: 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'ACCOUNT_INACTIVE',
  message: string
) {
  return res.status(401).json({
    success: false,
    data: null,
    error: { code, message },
    meta: {
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString()
    }
  });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return sendAuthenticationError(req, res, 'UNAUTHORIZED', 'Access token required');
  }

  let payload: JwtPayload;
  try {
    const token = header.slice(7);
    payload = verifyAccessToken(token);
  } catch {
    return sendAuthenticationError(
      req,
      res,
      'TOKEN_EXPIRED',
      'Access token is invalid or expired'
    );
  }

  try {
    const user = await User.findById(payload.userId).select('_id phone role branchIds status');

    if (!user || user.status !== 'active') {
      return sendAuthenticationError(
        req,
        res,
        'ACCOUNT_INACTIVE',
        'Account is inactive or unavailable'
      );
    }

    req.user = {
      userId: String(user._id),
      _id: String(user._id),
      role: user.role,
      branchIds: user.branchIds.map(String),
      isDemo: isDemoAccount(user.phone)
    };
    return next();
  } catch (err) {
    return next(err);
  }
}
