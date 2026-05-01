import { Router, type Router as ExpressRouter } from 'express';
import { Attendance } from '../../models/Attendance';
import { Child } from '../../models/Child';
import { Enrollment } from '../../models/Enrollment';
import { FeeLedger } from '../../models/FeeLedger';
import { sendSuccess } from '../../utils/response';

export const dashboardRouter: ExpressRouter = Router();

const DAY_INDEX: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6
};

function resolveNextClassDate(days: string[], startTime: string) {
  const now = new Date();
  let best: Date | null = null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidateDate = new Date(now);
    candidateDate.setDate(now.getDate() + offset);
    const dayCode = Object.entries(DAY_INDEX).find(([, value]) => value === candidateDate.getDay())?.[0];

    if (!dayCode || !days.includes(dayCode)) {
      continue;
    }

    const [hours, minutes] = startTime.split(':').map(Number);
    candidateDate.setHours(hours, minutes, 0, 0);

    if (candidateDate <= now) {
      continue;
    }

    if (!best || candidateDate < best) {
      best = candidateDate;
    }
  }

  return best;
}

dashboardRouter.get('/', async (req, res, next) => {
  try {
    const children = await Child.find({
      parentId: req.user!.userId,
      isActive: true
    }).select('_id name');
    const childIds = children.map((child) => child._id);

    const activeEnrollments = await Enrollment.find({
      childId: { $in: childIds },
      status: { $in: ['APPROVED', 'ACTIVE'] }
    })
      .populate('childId', 'name')
      .populate('batchId', 'name schedule monthlyFee')
      .populate('branchId', 'name city');

    const upcomingFee = await FeeLedger.findOne({
      childId: { $in: childIds },
      status: { $in: ['DUE', 'OVERDUE'] }
    })
      .populate('childId', 'name')
      .sort({ dueDate: 1 });

    const attendanceSince = new Date();
    attendanceSince.setDate(attendanceSince.getDate() - 30);

    const attendanceRecords = await Attendance.find({
      childId: { $in: childIds },
      date: { $gte: attendanceSince }
    });

    const attendedCount = attendanceRecords.filter((record) =>
      ['PRESENT', 'LATE'].includes(record.status)
    ).length;
    const attendancePercentage =
      attendanceRecords.length > 0
        ? Math.round((attendedCount / attendanceRecords.length) * 100)
        : null;

    let nextClass: {
      childName: string;
      batchName: string;
      branchName: string;
      schedule: { days: string[]; startTime: string; endTime: string };
      startsAt: string;
    } | null = null;

    for (const enrollment of activeEnrollments) {
      const batch = enrollment.batchId as unknown as {
        name: string;
        schedule: { days: string[]; startTime: string; endTime: string };
      };
      const child = enrollment.childId as unknown as { name: string };
      const branch = enrollment.branchId as unknown as { name: string };
      const startsAt = resolveNextClassDate(batch.schedule.days, batch.schedule.startTime);

      if (!startsAt) {
        continue;
      }

      if (!nextClass || new Date(startsAt) < new Date(nextClass.startsAt)) {
        nextClass = {
          childName: child.name,
          batchName: batch.name,
          branchName: branch.name,
          schedule: batch.schedule,
          startsAt: startsAt.toISOString()
        };
      }
    }

    return sendSuccess(req, res, {
      childrenCount: children.length,
      activeEnrollmentsCount: activeEnrollments.length,
      upcomingFee: upcomingFee
        ? {
            childName: (upcomingFee.childId as unknown as { name: string }).name,
            amount: upcomingFee.finalAmount,
            dueDate: upcomingFee.dueDate.toISOString(),
            month: upcomingFee.month,
            status: upcomingFee.status
          }
        : null,
      nextClass,
      recentAttendanceSummary: {
        percentage: attendancePercentage,
        totalClasses: attendanceRecords.length
      }
    });
  } catch (err) {
    return next(err);
  }
});
