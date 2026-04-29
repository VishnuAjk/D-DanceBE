import { Document, Schema, model } from 'mongoose';

export interface IOtpSession extends Document {
  phone: string;
  txnId: string;
  attempts: number;
  expiresAt: Date;
  verified: boolean;
}

const OtpSessionSchema = new Schema<IOtpSession>(
  {
    phone: { type: String, required: true, index: true },
    txnId: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }
    },
    verified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const OtpSession = model<IOtpSession>('OtpSession', OtpSessionSchema);
