import express, { type NextFunction, type Request, type Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/errorHandler';
import { AgeGroup } from '../../models/AgeGroup';
import { Batch } from '../../models/Batch';
import { Branch } from '../../models/Branch';
import { Course } from '../../models/Course';
import { Level } from '../../models/Level';
import { User } from '../../models/User';
import { batchesRouter } from './batches';

let mongoServer: MongoMemoryServer;

type TestRole = 'super_admin' | 'branch_admin';

function createTestApp(role: TestRole, branchIds: Types.ObjectId[]) {
  const app = express();
  const userId = new Types.ObjectId();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: String(userId),
      _id: String(userId),
      role,
      branchIds: branchIds.map(String)
    };
    next();
  });
  app.use('/batches', batchesRouter);
  app.use(errorHandler);
  return app;
}

async function createFixtures() {
  const [branchA, branchB] = await Branch.create([
    { name: `Branch A ${new Types.ObjectId()}`, address: 'Address A', isActive: true },
    { name: `Branch B ${new Types.ObjectId()}`, address: 'Address B', isActive: true }
  ]);
  const [courseA, courseB] = await Course.create([
    { name: `Course A ${new Types.ObjectId()}`, isActive: true },
    { name: `Course B ${new Types.ObjectId()}`, isActive: true }
  ]);
  const [levelA, levelB] = await Level.create([
    { name: 'Beginner', courseId: courseA._id, order: 1 },
    { name: 'Advanced', courseId: courseB._id, order: 1 }
  ]);
  const ageGroup = await AgeGroup.create({
    label: `Children ${new Types.ObjectId()}`,
    minAge: 6,
    maxAge: 12
  });
  const [instructorA, instructorB, nonInstructor] = await User.create([
    {
      phone: `1${String(new Types.ObjectId()).slice(-9)}`,
      name: 'Instructor A',
      role: 'instructor',
      branchIds: [branchA._id],
      status: 'active'
    },
    {
      phone: `2${String(new Types.ObjectId()).slice(-9)}`,
      name: 'Instructor B',
      role: 'instructor',
      branchIds: [branchB._id],
      status: 'active'
    },
    {
      phone: `3${String(new Types.ObjectId()).slice(-9)}`,
      name: 'Customer',
      role: 'customer',
      branchIds: [branchA._id],
      status: 'active'
    }
  ]);
  const batch = await Batch.create({
    name: `Batch ${new Types.ObjectId()}`,
    branchId: branchA._id,
    courseId: courseA._id,
    levelId: levelA._id,
    ageGroupId: ageGroup._id,
    instructorIds: [instructorA._id],
    schedule: { days: ['MON'], startTime: '10:00', endTime: '11:00' },
    capacity: 20,
    monthlyFee: 1_500,
    isActive: true
  });

  return {
    branchA,
    branchB,
    courseA,
    courseB,
    levelA,
    levelB,
    ageGroup,
    instructorA,
    instructorB,
    nonInstructor,
    batch
  };
}

describe('admin batch update scope', () => {
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

  it('allows a branch admin to edit a batch in an assigned branch', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('branch_admin', [fixture.branchA._id]))
      .put(`/batches/${fixture.batch._id}`)
      .send({ name: 'Updated batch' });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Updated batch');
  });

  it('allows a super admin to transfer a batch to another valid branch', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('super_admin', []))
      .put(`/batches/${fixture.batch._id}`)
      .send({
        branchId: String(fixture.branchB._id),
        instructorIds: [String(fixture.instructorB._id)]
      });

    expect(response.status).toBe(200);
    expect(response.body.data.branchId).toBe(String(fixture.branchB._id));
  });

  it('rejects an update when the branch admin does not own the source branch', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('branch_admin', [fixture.branchB._id]))
      .put(`/batches/${fixture.batch._id}`)
      .send({
        branchId: String(fixture.branchB._id),
        instructorIds: [String(fixture.instructorB._id)]
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('BRANCH_ACCESS_DENIED');
    const unchanged = await Batch.findById(fixture.batch._id).lean();
    expect(String(unchanged?.branchId)).toBe(String(fixture.branchA._id));
  });

  it('rejects a transfer when the branch admin does not own the destination branch', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('branch_admin', [fixture.branchA._id]))
      .put(`/batches/${fixture.batch._id}`)
      .send({ branchId: String(fixture.branchB._id) });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('BRANCH_ACCESS_DENIED');
  });

  it('rejects a forged replacement branch even for a super admin', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('super_admin', []))
      .put(`/batches/${fixture.batch._id}`)
      .send({ branchId: String(new Types.ObjectId()) });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_BATCH_REFERENCE');
  });

  it('rejects a missing replacement course', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('super_admin', []))
      .put(`/batches/${fixture.batch._id}`)
      .send({ courseId: String(new Types.ObjectId()) });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_BATCH_REFERENCE');
  });

  it('rejects a level that does not belong to the selected course', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('super_admin', []))
      .put(`/batches/${fixture.batch._id}`)
      .send({ levelId: String(fixture.levelB._id) });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_BATCH_REFERENCE');
  });

  it('rejects a missing age group', async () => {
    const fixture = await createFixtures();

    const response = await request(createTestApp('super_admin', []))
      .put(`/batches/${fixture.batch._id}`)
      .send({ ageGroupId: String(new Types.ObjectId()) });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_BATCH_REFERENCE');
  });

  it('rejects instructors with the wrong role or branch assignment', async () => {
    const fixture = await createFixtures();

    const wrongRole = await request(createTestApp('super_admin', []))
      .put(`/batches/${fixture.batch._id}`)
      .send({ instructorIds: [String(fixture.nonInstructor._id)] });
    const wrongBranch = await request(createTestApp('super_admin', []))
      .put(`/batches/${fixture.batch._id}`)
      .send({ instructorIds: [String(fixture.instructorB._id)] });

    expect(wrongRole.status).toBe(422);
    expect(wrongRole.body.error.code).toBe('INVALID_BATCH_REFERENCE');
    expect(wrongBranch.status).toBe(422);
    expect(wrongBranch.body.error.code).toBe('INVALID_BATCH_REFERENCE');
  });
});
