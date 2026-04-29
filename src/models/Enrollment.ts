import { Document, Schema, model } from 'mongoose';

type EnrollmentStatus = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export interface IEnrollment extends Document {
  childId: Schema.Types.ObjectId;
  batchId: Schema.Types.ObjectId;
  branchId: Schema.Types.ObjectId;
  status: EnrollmentStatus;
  approvedBy?: Schema.Types.ObjectId;
  approvedAt?: Date;
  joinDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    childId: { type: Schema.Types.ObjectId, ref: 'Child', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED'],
      default: 'PENDING',
      index: true
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    joinDate: Date,
    notes: { type: String, trim: true }
  },
  { timestamps: true }
);

EnrollmentSchema.index({ childId: 1, batchId: 1 }, { unique: true });

export const Enrollment = model<IEnrollment>('Enrollment', EnrollmentSchema);
