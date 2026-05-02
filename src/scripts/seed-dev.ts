import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { env } from '../config/env';
import { Branch } from '../models/Branch';
import { Batch } from '../models/Batch';
import { Course } from '../models/Course';
import { Level } from '../models/Level';
import { User } from '../models/User';

async function seedDev() {
  await connectDB(env.MONGODB_URI);

  const branch = await Branch.findOneAndUpdate(
    { name: 'Indiranagar Studio' },
    {
      name: 'Indiranagar Studio',
      address: '100 Feet Road, Indiranagar',
      city: 'Bengaluru',
      phone: '9876500001',
      isActive: true
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const course = await Course.findOneAndUpdate(
    { name: 'Bharatanatyam' },
    {
      name: 'Bharatanatyam',
      description: 'Foundational Bharatanatyam curriculum',
      isActive: true
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const level = await Level.findOneAndUpdate(
    { courseId: course._id, order: 1 },
    {
      name: 'Beginner',
      courseId: course._id,
      order: 1
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await User.findOneAndUpdate(
    { phone: '9990000001' },
    {
      name: 'Super Admin',
      phone: '9990000001',
      role: 'super_admin',
      branchIds: [branch._id],
      status: 'active'
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await User.findOneAndUpdate(
    { phone: '9990000002' },
    {
      name: 'Branch Admin',
      phone: '9990000002',
      role: 'branch_admin',
      branchIds: [branch._id],
      status: 'active'
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const instructor = await User.findOneAndUpdate(
    { phone: '9990000003' },
    {
      name: 'Lead Instructor',
      phone: '9990000003',
      role: 'instructor',
      branchIds: [branch._id],
      status: 'active'
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const batch = await Batch.findOneAndUpdate(
    { branchId: branch._id, name: 'Beginner Evening Batch' },
    {
      name: 'Beginner Evening Batch',
      branchId: branch._id,
      courseId: course._id,
      levelId: level._id,
      instructorIds: [instructor._id],
      schedule: {
        days: ['MON', 'WED', 'FRI'],
        startTime: '18:00',
        endTime: '19:00'
      },
      capacity: 25,
      monthlyFee: 2500,
      isActive: true
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  console.log('Dev seed complete');
  console.log(`Branch: ${branch.name}`);
  console.log(`Course: ${course.name}`);
  console.log(`Batch: ${batch.name}`);
  console.log('Login test users:');
  console.log('  super_admin: 9990000001');
  console.log('  branch_admin: 9990000002');
  console.log('  instructor: 9990000003');
  console.log('Use OTP: 123456 when OTP_PROVIDER=mock');
}

seedDev()
  .catch((error) => {
    console.error('Dev seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
