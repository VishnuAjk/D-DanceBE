import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { Attendance } from '../../models/Attendance';
import { Batch } from '../../models/Batch';
import { Enrollment } from '../../models/Enrollment';
import { FeeLedger } from '../../models/FeeLedger';
import { sendSuccess } from '../../utils/response';

export const reportsRouter: ExpressRouter = Router();

const MonthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

function toObjectId(value: string) {
  return new Types.ObjectId(value);
}

function scopedBranchIds(reqBranchIds: unknown[] | undefined) {
  return (reqBranchIds ?? []).map((id) => String(id));
}

function branchMatchForAdmin(requestedBranchId: string | undefined, userBranchIds: unknown[] | undefined) {
  if (!requestedBranchId) {
    const allowedIds = scopedBranchIds(userBranchIds);

    return allowedIds.length ? { $in: allowedIds.map(toObjectId) } : { $in: [] };
  }

  const allowedIds = scopedBranchIds(userBranchIds);

  if (!allowedIds.includes(requestedBranchId)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this branch');
  }

  return toObjectId(requestedBranchId);
}

function monthBounds(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));

  return { start, end };
}

reportsRouter.get('/revenue', async (req, res, next) => {
  try {
    const query = z
      .object({
        branchId: ObjectIdString.optional(),
        fromMonth: MonthString,
        toMonth: MonthString
      })
      .refine((value) => value.fromMonth <= value.toMonth, {
        message: 'fromMonth must be before or equal to toMonth',
        path: ['fromMonth']
      })
      .parse(req.query);

    const match: Record<string, unknown> = {
      status: 'PAID',
      month: { $gte: query.fromMonth, $lte: query.toMonth }
    };

    if (req.user?.role === 'branch_admin') {
      match.branchId = branchMatchForAdmin(query.branchId, req.user.branchIds);
    } else if (query.branchId) {
      match.branchId = toObjectId(query.branchId);
    }

    const revenue = await FeeLedger.aggregate<{
      _id: string;
      total: number;
      count: number;
    }>([
      { $match: match },
      { $group: { _id: '$month', total: { $sum: '$finalAmount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    return sendSuccess(req, res, {
      fromMonth: query.fromMonth,
      toMonth: query.toMonth,
      rows: revenue.map((row) => ({ month: row._id, total: row.total, count: row.count })),
      total: revenue.reduce((sum, row) => sum + row.total, 0)
    });
  } catch (err) {
    return next(err);
  }
});

reportsRouter.get('/attendance', async (req, res, next) => {
  try {
    const query = z
      .object({
        batchId: ObjectIdString,
        month: MonthString
      })
      .parse(req.query);
    const batch = await Batch.findById(query.batchId).select('branchId name').lean();

    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Batch not found');
    }

    if (req.user?.role === 'branch_admin') {
      branchMatchForAdmin(String(batch.branchId), req.user.branchIds);
    }

    const { start, end } = monthBounds(query.month);
    const rows = await Attendance.find({
      batchId: query.batchId,
      date: { $gte: start, $lt: end }
    })
      .populate('studentProfileId', 'name')
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const summary = rows.reduce(
      (acc, row) => {
        acc[row.status] += 1;
        acc.total += 1;
        return acc;
      },
      { PRESENT: 0, ABSENT: 0, LATE: 0, total: 0 }
    );

    return sendSuccess(req, res, {
      batch: { _id: String(batch._id), name: batch.name },
      month: query.month,
      summary,
      rows: rows.map((row) => ({
        _id: String(row._id),
        date: row.date.toISOString(),
        status: row.status,
        studentProfileName:
          typeof row.studentProfileId === 'object' && row.studentProfileId && 'name' in row.studentProfileId
            ? String(row.studentProfileId.name)
            : 'Student',
        notes: row.notes
      }))
    });
  } catch (err) {
    return next(err);
  }
});

reportsRouter.get('/enrollment-stats', async (req, res, next) => {
  try {
    const query = z.object({ branchId: ObjectIdString.optional() }).parse(req.query);
    const match: Record<string, unknown> = {};

    if (req.user?.role === 'branch_admin') {
      match.branchId = branchMatchForAdmin(query.branchId, req.user.branchIds);
    } else if (query.branchId) {
      match.branchId = toObjectId(query.branchId);
    }

    const stats = await Enrollment.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const rows = ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED'].map((status) => ({
      status,
      count: stats.find((row) => row._id === status)?.count ?? 0
    }));

    return sendSuccess(req, res, {
      rows,
      total: rows.reduce((sum, row) => sum + row.count, 0)
    });
  } catch (err) {
    return next(err);
  }
});
