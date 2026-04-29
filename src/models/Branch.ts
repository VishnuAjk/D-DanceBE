import { Document, Schema, model } from 'mongoose';

export interface IBranch extends Document {
  name: string;
  address: string;
  city?: string;
  phone?: string;
  isActive: boolean;
}

const BranchSchema = new Schema<IBranch>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    city: { type: String, trim: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export const Branch = model<IBranch>('Branch', BranchSchema);
