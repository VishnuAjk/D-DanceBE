import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { env } from '../config/env';
import { Assessment } from '../models/Assessment';
import { Attendance } from '../models/Attendance';
import { Batch } from '../models/Batch';
import { Branch } from '../models/Branch';
import { Course } from '../models/Course';
import { Enrollment } from '../models/Enrollment';
import { FeeLedger } from '../models/FeeLedger';
import { Level } from '../models/Level';
import { StudentProfile } from '../models/StudentProfile';
import { User } from '../models/User';
import { Video } from '../models/Video';

function daysAgo(days: number) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - days);
  return value;
}

async function seedDemo() {
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
    { name: 'Bharatanatyam', description: 'Foundational Bharatanatyam curriculum', isActive: true },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const level = await Level.findOneAndUpdate(
    { courseId: course._id, order: 1 },
    { name: 'Beginner', courseId: course._id, order: 1 },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const superAdmin = await User.findOneAndUpdate(
    { phone: '9990000001' },
    { name: 'Demo Super Admin', role: 'super_admin', branchIds: [branch._id], status: 'active' },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await User.findOneAndUpdate(
    { phone: '9990000002' },
    { name: 'Demo Branch Admin', role: 'branch_admin', branchIds: [branch._id], status: 'active' },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const instructor = await User.findOneAndUpdate(
    { phone: '9990000003' },
    { name: 'Demo Instructor', role: 'instructor', branchIds: [branch._id], status: 'active' },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const customer = await User.findOneAndUpdate(
    { phone: '9990000004' },
    { name: 'Demo Family', role: 'customer', branchIds: [branch._id], status: 'active' },
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
      schedule: { days: ['MON', 'WED', 'FRI'], startTime: '18:00', endTime: '19:00' },
      capacity: 25,
      monthlyFee: 2500,
      isActive: true
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const student = await StudentProfile.findOneAndUpdate(
    { customerId: customer._id, name: 'Anaya Rao' },
    {
      name: 'Anaya Rao',
      dob: new Date('2015-06-15T00:00:00.000Z'),
      gender: 'female',
      customerId: customer._id,
      relationshipToCustomer: 'child',
      isActive: true
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const enrollment = await Enrollment.findOneAndUpdate(
    { studentProfileId: student._id, batchId: batch._id },
    {
      branchId: branch._id,
      status: 'ACTIVE',
      approvedBy: superAdmin._id,
      approvedAt: daysAgo(45),
      joinDate: daysAgo(42),
      notes: 'Seeded demo enrollment'
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  for (const [days, status] of [[2, 'PRESENT'], [5, 'LATE'], [9, 'PRESENT']] as const) {
    const date = daysAgo(days);
    await Attendance.findOneAndUpdate(
      { studentProfileId: student._id, batchId: batch._id, date },
      { branchId: branch._id, status, markedBy: instructor._id, notes: 'Demo attendance record' },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  await Assessment.findOneAndUpdate(
    { studentProfileId: student._id, batchId: batch._id, remarks: 'Strong foundational progress.' },
    {
      branchId: branch._id,
      levelId: level._id,
      assessedBy: instructor._id,
      assessedAt: daysAgo(7),
      sharedWithCustomer: true,
      sharedAt: daysAgo(6),
      overallScore: 86,
      remarks: 'Strong foundational progress.',
      skillScores: [
        { skill: 'Posture', score: 88, notes: 'Confident alignment' },
        { skill: 'Rhythm', score: 84, notes: 'Steady timing' }
      ]
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  const month = new Date().toISOString().slice(0, 7);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  await FeeLedger.findOneAndUpdate(
    { enrollmentId: enrollment._id, month },
    {
      studentProfileId: student._id,
      branchId: branch._id,
      amount: 2500,
      discount: 0,
      finalAmount: 2500,
      status: 'DUE',
      dueDate
    },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  await Video.findOneAndUpdate(
    { title: 'Demo: Beginner Adavu Practice' },
    {
      description: 'A short practice reference for the demo class.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      tags: ['beginner', 'practice'],
      courseId: course._id,
      levelId: level._id,
      branchIds: [branch._id],
      isPublished: true,
      publishedAt: daysAgo(3),
      createdBy: superAdmin._id
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  console.log('Demo seed complete');
  console.log('Super Admin: 9990000001');
  console.log('Branch Admin: 9990000002');
  console.log('Instructor: 9990000003');
  console.log('Customer / Family: 9990000004');
  console.log(`OTP: ${env.DEMO_OTP_CODE}`);
}

seedDemo()
  .catch((error) => {
    console.error('Demo seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
