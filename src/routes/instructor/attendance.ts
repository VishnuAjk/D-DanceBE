import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Attendance } from '../../models/Attendance';
import { Batch } from '../../models/Batch';
import { Enrollment } from '../../models/Enrollment';
import { sendSuccess } from '../../utils/response';

export const attendanceRouter: ExpressRouter = Router();

const ISO_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function parseUtcDay(value: string) {
  // Force UTC midnight so we can reliably match by date across timezones.
  return new Date(`${value}T00:00:00.000Z`);
}

async function findInstructorBatch(batchId: string, userId: string, isSuperAdmin: boolean) {
  const filter = isSuperAdmin ? { _id: batchId } : { _id: batchId, instructorIds: userId };
  const batch = await Batch.findOne(filter).select('_id branchId instructorIds');

  if (!batch) {
    throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  }

  return batch;
}

const MarkAttendanceSchema = z.object({
  batchId: ObjectIdString,
  date: ISO_DAY,
  records: z
    .array(
      z.object({
        studentProfileId: ObjectIdString,
        status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
        notes: z.string().max(200).optional()
      })
    )
    .min(1)
});

attendanceRouter.post('/mark', async (req, res, next) => {
  try {
    const payload = MarkAttendanceSchema.parse(req.body);
    const isSuperAdmin = req.user?.role === 'super_admin';
    const batch = await findInstructorBatch(payload.batchId, req.user!._id, isSuperAdmin);
    const parsedDate = parseUtcDay(payload.date);

    const enrollments = await Enrollment.find({
      batchId: payload.batchId,
      status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED'] }
    }).select('studentProfileId');

    const rosterStudentProfileIds = new Set(enrollments.map((enr) => String(enr.studentProfileId)));

    payload.records.forEach((record) => {
      if (!rosterStudentProfileIds.has(record.studentProfileId)) {
        throw new AppError(400, 'INVALID_STUDENT_PROFILE', 'One or more attendance records is not in this batch');
      }
    });

    const writes = payload.records.map((record) =>
      Attendance.findOneAndUpdate(
        { studentProfileId: record.studentProfileId, batchId: payload.batchId, date: parsedDate },
        {
          studentProfileId: record.studentProfileId,
          batchId: payload.batchId,
          branchId: batch.branchId,
          date: parsedDate,
          status: record.status,
          notes: record.notes,
          markedBy: req.user!._id
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    );

    const results = await Promise.all(writes);
    return sendSuccess(req, res, results);
  } catch (err) {
    return next(err);
  }
});

attendanceRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        batchId: ObjectIdString.optional(),
        dateFrom: ISO_DAY.optional(),
        dateTo: ISO_DAY.optional()
      })
      .parse(req.query);

    const isSuperAdmin = req.user?.role === 'super_admin';
    const filter: Record<string, unknown> = {};

    if (query.batchId) {
      const batch = await findInstructorBatch(query.batchId, req.user!._id, isSuperAdmin);
      filter.batchId = String(batch._id);
    } else if (!isSuperAdmin) {
      const batches = await Batch.find({ instructorIds: req.user!._id }).select('_id');
      filter.batchId = { $in: batches.map((b) => b._id) };
    }

    if (query.dateFrom || query.dateTo) {
      filter.date = {};
      if (query.dateFrom) {
        (filter.date as Record<string, unknown>).$gte = parseUtcDay(query.dateFrom);
      }
      if (query.dateTo) {
        (filter.date as Record<string, unknown>).$lte = parseUtcDay(query.dateTo);
      }
    }

    const records = await Attendance.find(filter)
      .populate('studentProfileId', 'name dob gender photo')
      .populate('batchId', 'name')
      .sort({ date: -1, createdAt: -1 });

    return sendSuccess(req, res, records);
  } catch (err) {
    return next(err);
  }
});

