import express, { type NextFunction, type Request, type Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/errorHandler';
import '../../models/Batch';
import '../../models/Branch';
import '../../models/Enrollment';
import { FeeLedger } from '../../models/FeeLedger';
import { StudentProfile } from '../../models/StudentProfile';
import { feesRouter } from './fees';

let mongoServer: MongoMemoryServer;

function createTestApp(customerId: Types.ObjectId) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: String(customerId),
      _id: String(customerId),
      role: 'customer',
      branchIds: []
    };
    next();
  });
  app.use('/fees', feesRouter);
  app.use(errorHandler);
  return app;
}

async function createStudentProfile(customerId: Types.ObjectId, isActive = true) {
  return StudentProfile.create({
    name: `Student ${new Types.ObjectId()}`,
    dob: new Date('2015-01-01T00:00:00.000Z'),
    gender: 'female',
    customerId,
    relationshipToCustomer: 'child',
    isActive
  });
}

async function createFee(studentProfileId: Types.ObjectId, month: string) {
  return FeeLedger.create({
    enrollmentId: new Types.ObjectId(),
    studentProfileId,
    branchId: new Types.ObjectId(),
    month,
    amount: 1_000,
    discount: 0,
    finalAmount: 1_000,
    status: 'DUE',
    dueDate: new Date(`${month}-10T00:00:00.000Z`)
  });
}

describe('customer fee ownership', () => {
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

  it('returns fees for an active profile owned by the authenticated customer', async () => {
    const customerId = new Types.ObjectId();
    const ownedProfile = await createStudentProfile(customerId);
    const ownedFee = await createFee(ownedProfile._id, '2026-01');

    const response = await request(createTestApp(customerId))
      .get('/fees')
      .query({ studentProfileId: String(ownedProfile._id) });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(String(ownedFee._id));
  });

  it('returns the same not-found response for a profile owned by another customer', async () => {
    const customerId = new Types.ObjectId();
    const foreignProfile = await createStudentProfile(new Types.ObjectId());
    await createFee(foreignProfile._id, '2026-02');

    const response = await request(createTestApp(customerId))
      .get('/fees')
      .query({ studentProfileId: String(foreignProfile._id) });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Student profile not found'
    });
  });

  it('returns not found for an inactive owned profile', async () => {
    const customerId = new Types.ObjectId();
    const inactiveProfile = await createStudentProfile(customerId, false);
    await createFee(inactiveProfile._id, '2026-03');

    const response = await request(createTestApp(customerId))
      .get('/fees')
      .query({ studentProfileId: String(inactiveProfile._id) });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns not found for a nonexistent profile without revealing why', async () => {
    const customerId = new Types.ObjectId();

    const response = await request(createTestApp(customerId))
      .get('/fees')
      .query({ studentProfileId: String(new Types.ObjectId()) });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Student profile not found'
    });
  });

  it('limits an unfiltered request to active profiles owned by the customer', async () => {
    const customerId = new Types.ObjectId();
    const ownedProfile = await createStudentProfile(customerId);
    const inactiveProfile = await createStudentProfile(customerId, false);
    const foreignProfile = await createStudentProfile(new Types.ObjectId());
    const ownedFee = await createFee(ownedProfile._id, '2026-04');
    await createFee(inactiveProfile._id, '2026-05');
    await createFee(foreignProfile._id, '2026-06');

    const response = await request(createTestApp(customerId)).get('/fees');

    expect(response.status).toBe(200);
    expect(response.body.data.map((fee: { _id: string }) => fee._id)).toEqual([
      String(ownedFee._id)
    ]);
  });

  it('applies the same ownership check to the legacy childId alias', async () => {
    const customerId = new Types.ObjectId();
    const ownedProfile = await createStudentProfile(customerId);
    const ownedFee = await createFee(ownedProfile._id, '2026-07');

    const response = await request(createTestApp(customerId))
      .get('/fees')
      .query({ childId: String(ownedProfile._id) });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(String(ownedFee._id));
  });
});
