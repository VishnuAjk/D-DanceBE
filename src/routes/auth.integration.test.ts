import type { UserRoleType } from '@danceapp/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { errorHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { OtpSession } from '../models/OtpSession';
import { User } from '../models/User';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { authRouter } from './auth';

let mongoServer: MongoMemoryServer;

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/auth', authRouter);
  app.get('/protected', authenticate, requireRole('branch_admin'), (req, res) => {
    res.status(200).json({ success: true, data: req.user });
  });
  app.use(errorHandler);
  return app;
}

async function createUser(
  overrides: Partial<{
    phone: string;
    role: 'super_admin' | 'branch_admin' | 'instructor' | 'customer' | 'parent';
    branchIds: Types.ObjectId[];
    status: 'active' | 'inactive' | 'suspended';
  }> = {}
) {
  return User.create({
    phone: overrides.phone ?? `8${String(new Types.ObjectId()).slice(-9)}`,
    name: 'Test User',
    role: overrides.role ?? 'customer',
    branchIds: overrides.branchIds ?? [],
    status: overrides.status ?? 'active'
  });
}

function accessTokenFor(user: {
  _id: unknown;
  role: UserRoleType;
  branchIds: Array<{ toString(): string }>;
}) {
  return signAccessToken({
    userId: String(user._id),
    role: user.role,
    branchIds: user.branchIds.map(String)
  });
}

describe('authentication revocation', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterEach(async () => {
    await mongoose.connection.db?.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it.each(['inactive', 'suspended'] as const)(
    'does not issue tokens to an %s account after successful OTP verification',
    async (status) => {
      const phone = '9990000004';
      const txnId = `txn-${status}`;
      await createUser({ phone, status });
      await OtpSession.create({
        phone,
        txnId,
        expiresAt: new Date(Date.now() + 60_000)
      });

      const response = await request(createTestApp()).post('/auth/otp-verify').send({
        phone,
        otp: env.DEMO_OTP_CODE,
        txnId
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  );

  it('revokes an access token immediately when the account is suspended', async () => {
    const user = await createUser({ role: 'branch_admin', branchIds: [new Types.ObjectId()] });
    const accessToken = accessTokenFor(user);
    await User.updateOne({ _id: user._id }, { status: 'suspended' });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('uses current database roles and branches instead of stale token claims', async () => {
    const originalBranchId = new Types.ObjectId();
    const currentBranchId = new Types.ObjectId();
    const user = await createUser({ role: 'customer', branchIds: [originalBranchId] });
    const accessToken = accessTokenFor(user);
    await User.updateOne(
      { _id: user._id },
      { role: 'branch_admin', branchIds: [currentBranchId] }
    );

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('branch_admin');
    expect(response.body.data.branchIds).toEqual([String(currentBranchId)]);
    expect(response.body.data.branchIds).not.toContain(String(originalBranchId));
  });

  it('removes protected access immediately when a role is revoked', async () => {
    const user = await createUser({ role: 'branch_admin', branchIds: [new Types.ObjectId()] });
    const accessToken = accessTokenFor(user);
    await User.updateOne({ _id: user._id }, { role: 'customer', branchIds: [] });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects tokens for deleted users', async () => {
    const user = await createUser({ role: 'branch_admin' });
    const accessToken = accessTokenFor(user);
    await User.deleteOne({ _id: user._id });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('rejects refresh tokens when the current account is inactive', async () => {
    const user = await createUser({ status: 'suspended' });
    const refreshToken = signRefreshToken({
      userId: String(user._id),
      role: user.role,
      branchIds: []
    });

    const response = await request(createTestApp())
      .post('/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('clears the refresh cookie even when the access token is expired', async () => {
    const userId = new Types.ObjectId();
    const expiredAccessToken = jwt.sign(
      { userId: String(userId), role: 'customer', branchIds: [] },
      env.JWT_ACCESS_SECRET,
      { issuer: 'danceapp', expiresIn: -1 }
    );

    const response = await request(createTestApp())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${expiredAccessToken}`)
      .set('Cookie', 'refreshToken=expired-refresh-token');

    expect(response.status).toBe(200);
    expect(response.body.data.message).toBe('Logged out successfully');
    expect(
      (response.headers['set-cookie'] as unknown as string[] | undefined)?.some((cookie) =>
        cookie.startsWith('refreshToken=;')
      )
    ).toBe(true);
  });
});
