import { Document, Schema, model } from 'mongoose';

type PaymentStatus = 'CREATED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
type PaymentType = 'one_time' | 'subscription';

export interface IPayment extends Document {
  enrollmentId?: Schema.Types.ObjectId;
  feeLedgerId?: Schema.Types.ObjectId;
  childId?: Schema.Types.ObjectId;
  branchId?: Schema.Types.ObjectId;
  amount: number;
  currency: string;
  status: PaymentStatus;
  type: PaymentType;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySubscriptionId?: string;
  razorpaySignature?: string;
  notes?: Record<string, unknown>;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', index: true },
    feeLedgerId: { type: Schema.Types.ObjectId, ref: 'FeeLedger', index: true },
    childId: { type: Schema.Types.ObjectId, ref: 'Child', index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'INR', uppercase: true, trim: true },
    status: {
      type: String,
      enum: ['CREATED', 'CAPTURED', 'FAILED', 'REFUNDED'],
      default: 'CREATED',
      index: true
    },
    type: {
      type: String,
      enum: ['one_time', 'subscription'],
      default: 'one_time'
    },
    razorpayOrderId: { type: String, trim: true },
    razorpayPaymentId: { type: String, trim: true },
    razorpaySubscriptionId: { type: String, trim: true },
    razorpaySignature: { type: String, trim: true },
    notes: { type: Schema.Types.Mixed },
    paidAt: Date
  },
  { timestamps: true }
);

PaymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });

export const Payment = model<IPayment>('Payment', PaymentSchema);
