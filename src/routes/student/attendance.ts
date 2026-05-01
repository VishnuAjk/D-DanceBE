import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Attendance } from '../../models/Attendance';
import { Child } from '../../models/Child';
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
        childId: ObjectIdString,
        month: ISO_MONTH
      })
      .parse(req.query);

    const child = await Child.findOne({
      _id: query.childId,
      parentId: req.user!.userId,
      isActive: true
    }).select('_id');

    if (!child) {
      throw new AppError(404, 'NOT_FOUND', 'Child not found');
    }

    const dateFrom = startOfMonthUtc(query.month);
    const dateTo = endOfMonthUtc(query.month);

    const records = await Attendance.find({
      childId: query.childId,
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

