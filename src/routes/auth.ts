import { PhoneNumber } from '@danceapp/shared';
import rateLimit from 'express-rate-limit';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { otpAdapter } from '../adapters/otp';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAuth } from '../middleware/rbac';
import { OtpSession } from '../models/OtpSession';
import { User } from '../models/User';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendSuccess } from '../utils/response';

export const authRouter: ExpressRouter = Router();

const otpRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => String(req.body?.phone || req.ip || 'unknown'),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many OTP requests. Try again shortly.'
    }
  }
});

const credentialRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => String(req.body?.phone || req.ip || 'unknown'),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts. Try again shortly.'
    }
  }
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE === 'true' || env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  domain: env.COOKIE_DOMAIN,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/'
};

const PushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1)
    })
  })
});

authRouter.post('/otp-send', otpRateLimit, async (req, res, next) => {
  try {
    const { phone } = z.object({ phone: PhoneNumber }).parse(req.body);
    const result = await otpAdapter.send(phone);

    await OtpSession.create({
      phone,
      txnId: result.txnId,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000)
    });

    return sendSuccess(req, res, {
      txnId: result.txnId,
      expiresIn: result.expiresIn
    });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/otp-verify', credentialRateLimit, async (req, res, next) => {
  try {
    const { phone, otp, txnId } = z
      .object({
        phone: PhoneNumber,
        otp: z.string().length(6),
        txnId: z.string()
      })
      .parse(req.body);

    const session = await OtpSession.findOne({ phone, txnId, verified: false });

    if (!session) {
      throw new AppError(400, 'INVALID_OTP_SESSION', 'OTP session not found or expired');
    }

    if (session.attempts >= 5) {
      throw new AppError(429, 'OTP_MAX_ATTEMPTS', 'Too many failed attempts');
    }

    if (session.expiresAt < new Date()) {
      throw new AppError(400, 'OTP_EXPIRED', 'OTP has expired');
    }

    const isValid = await otpAdapter.verify(phone, otp, txnId);

    if (!isValid) {
      await OtpSession.updateOne({ _id: session._id }, { $inc: { attempts: 1 } });
      throw new AppError(400, 'INVALID_OTP', 'Incorrect OTP');
    }

    await OtpSession.updateOne({ _id: session._id }, { verified: true });

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        phone,
        name: 'New User',
        role: 'parent'
      });
    }

    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    const jwtPayload = {
      userId: String(user._id),
      role: user.role,
      branchIds: user.branchIds.map(String)
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return sendSuccess(req, res, {
      accessToken,
      user: {
        _id: String(user._id),
        name: user.name,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token missing');
    }

    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.userId).select('_id name role branchIds status');

    if (!user || user.status !== 'active') {
      throw new AppError(401, 'UNAUTHORIZED', 'User not found or inactive');
    }

    const newPayload = {
      userId: String(user._id),
      role: user.role,
      branchIds: user.branchIds.map(String)
    };

    const accessToken = signAccessToken(newPayload);
    const refreshToken = signRefreshToken(newPayload);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    return sendSuccess(req, res, { accessToken });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/logout', authenticate, requireAuth, (req, res) => {
  res.clearCookie('refreshToken', {
    path: '/',
    domain: env.COOKIE_DOMAIN
  });

  return sendSuccess(req, res, { message: 'Logged out successfully' });
});

authRouter.get('/me', authenticate, requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.userId).select(
      '-fcmTokens -webPushSubscriptions -__v'
    );

    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    return sendSuccess(req, res, user);
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/push-subscribe', authenticate, requireAuth, async (req, res, next) => {
  try {
    const payload = PushSubscriptionSchema.parse(req.body);
    const user = await User.findById(req.user!.userId);

    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    const exists = user.webPushSubscriptions.some(
      (item) => item.endpoint === payload.subscription.endpoint
    );

    if (!exists) {
      user.webPushSubscriptions.push({
        endpoint: payload.subscription.endpoint,
        keys: payload.subscription.keys,
        createdAt: new Date()
      });
      await user.save();
    }

    return sendSuccess(req, res, { subscribed: true });
  } catch (err) {
    return next(err);
  }
});
