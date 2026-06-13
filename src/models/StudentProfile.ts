import { Document, Schema, model } from 'mongoose';

type Gender = 'male' | 'female' | 'other';

export interface IStudentProfile extends Document {
  name: string;
  dob: Date;
  gender: Gender;
  customerId: Schema.Types.ObjectId;
  relationshipToCustomer: 'self' | 'child' | 'family_member';
  photo?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StudentProfileSchema = new Schema<IStudentProfile>(
  {
    name: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    relationshipToCustomer: {
      type: String,
      enum: ['self', 'child', 'family_member'],
      default: 'child',
      required: true
    },
    photo: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

StudentProfileSchema.index({ customerId: 1, name: 1, dob: 1 });

export const StudentProfile = model<IStudentProfile>('StudentProfile', StudentProfileSchema);
