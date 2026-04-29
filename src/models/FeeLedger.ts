import { Document, Schema, model } from 'mongoose';

type FeeStatus = 'DUE' | 'PAID' | 'OVERDUE' | 'WAIVED';

export interface IFeeLedger extends Document {
  enrollmentId: Schema.Types.ObjectId;
  childId: Schema.Types.ObjectId;
  branchId: Schema.Types.ObjectId;
  month: string;
  amount: number;
  discount: number;
  finalAmount: number;
  status: FeeStatus;
  paidAt?: Date;
  dueDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FeeLedgerSchema = new Schema<IFeeLedger>(
  {
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    childId: { type: Schema.Types.ObjectId, ref: 'Child', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    finalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['DUE', 'PAID', 'OVERDUE', 'WAIVED'], default: 'DUE', index: true },
    paidAt: Date,
    dueDate: { type: Date, required: true }
  },
  { timestamps: true }
);

FeeLedgerSchema.pre('validate', function deriveFinalAmount(next) {
  const calculated = Number(this.amount ?? 0) - Number(this.discount ?? 0);

  if (calculated < 0) {
    next(new Error('Discount cannot exceed amount'));
    return;
  }

  this.finalAmount = calculated;
  next();
});

FeeLedgerSchema.index({ enrollmentId: 1, month: 1 }, { unique: true });

export const FeeLedger = model<IFeeLedger>('FeeLedger', FeeLedgerSchema);
