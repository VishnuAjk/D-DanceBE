import { Document, Schema, model } from 'mongoose';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';

export interface IAttendance extends Document {
  studentProfileId: Schema.Types.ObjectId;
  batchId: Schema.Types.ObjectId;
  branchId: Schema.Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  markedBy: Schema.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    studentProfileId: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    date: { type: Date, required: true, index: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT', 'LATE'], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true }
  },
  { timestamps: true }
);

AttendanceSchema.index({ studentProfileId: 1, batchId: 1, date: 1 }, { unique: true });

export const Attendance = model<IAttendance>('Attendance', AttendanceSchema);
