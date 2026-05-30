import { Router, type Router as ExpressRouter } from 'express';
import { Attendance } from '../../models/Attendance';
import { StudentProfile } from '../../models/StudentProfile';
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
    const studentProfiles = await StudentProfile.find({
      customerId: req.user!.userId,
      isActive: true
    }).select('_id name');
    const studentProfileIds = studentProfiles.map((studentProfile) => studentProfile._id);

    const activeEnrollments = await Enrollment.find({
      studentProfileId: { $in: studentProfileIds },
      status: { $in: ['APPROVED', 'ACTIVE'] }
    })
      .populate('studentProfileId', 'name')
      .populate('batchId', 'name schedule monthlyFee')
      .populate('branchId', 'name city');

    const upcomingFee = await FeeLedger.findOne({
      studentProfileId: { $in: studentProfileIds },
      status: { $in: ['DUE', 'OVERDUE'] }
    })
      .populate('studentProfileId', 'name')
      .sort({ dueDate: 1 });

    const attendanceSince = new Date();
    attendanceSince.setDate(attendanceSince.getDate() - 30);

    const attendanceRecords = await Attendance.find({
      studentProfileId: { $in: studentProfileIds },
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
      studentProfileName: string;
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
      const studentProfile = enrollment.studentProfileId as unknown as { name: string };
      const branch = enrollment.branchId as unknown as { name: string };
      const startsAt = resolveNextClassDate(batch.schedule.days, batch.schedule.startTime);

      if (!startsAt) {
        continue;
      }

      if (!nextClass || new Date(startsAt) < new Date(nextClass.startsAt)) {
        nextClass = {
          studentProfileName: studentProfile.name,
          batchName: batch.name,
          branchName: branch.name,
          schedule: batch.schedule,
          startsAt: startsAt.toISOString()
        };
      }
    }

    return sendSuccess(req, res, {
      studentProfilesCount: studentProfiles.length,
      activeEnrollmentsCount: activeEnrollments.length,
      upcomingFee: upcomingFee
        ? {
            studentProfileName: (upcomingFee.studentProfileId as unknown as { name: string }).name,
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
