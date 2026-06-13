import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Attendance } from '../../models/Attendance';
import { StudentProfile } from '../../models/StudentProfile';
import { sendSuccess } from '../../utils/response';

export const attendanceRouter: ExpressRouter = Router();

const ISO_MONTH = z.string().regex(/^\d{4}-\d{2}$/);

function startOfMonthUtc(month: string) {
  return new Date(`${month}-01T00:00:00.000Z`);
}

function endOfMonthUtc(month: string) {
  const [year, mm] = month.split('-').map((value) => Number(value));
  const nextMonth = new Date(Date.UTC(year, mm, 1, 0, 0, 0, 0));
  return new Date(nextMonth.getTime() - 1);
}

function formatUtcDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

attendanceRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        studentProfileId: ObjectIdString.optional(),
        childId: ObjectIdString.optional(),
        month: ISO_MONTH
      })
      .transform((value) => ({
        studentProfileId: value.studentProfileId ?? value.childId,
        month: value.month
      }))
      .refine((value) => Boolean(value.studentProfileId), {
        message: 'Student profile is required',
        path: ['studentProfileId']
      })
      .parse(req.query);

    const studentProfile = await StudentProfile.findOne({
      _id: query.studentProfileId,
      customerId: req.user!.userId,
      isActive: true
    }).select('_id');

    if (!studentProfile) {
      throw new AppError(404, 'NOT_FOUND', 'Student profile not found');
    }

    const dateFrom = startOfMonthUtc(query.month);
    const dateTo = endOfMonthUtc(query.month);

    const records = await Attendance.find({
      studentProfileId: query.studentProfileId,
      date: { $gte: dateFrom, $lte: dateTo }
    })
      .select('date status notes batchId')
      .populate('batchId', 'name')
      .sort({ date: 1 });

    const normalized = records.map((record) => ({
      _id: String(record._id),
      date: formatUtcDay(record.date),
      status: record.status,
      notes: record.notes,
      batchId: record.batchId
    }));

    return sendSuccess(req, res, normalized);
  } catch (err) {
    return next(err);
  }
});
