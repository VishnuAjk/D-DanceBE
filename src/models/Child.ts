import { Document, Schema, model } from 'mongoose';

type Gender = 'male' | 'female' | 'other';

export interface IChild extends Document {
  name: string;
  dob: Date;
  gender: Gender;
  parentId: Schema.Types.ObjectId;
  photo?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChildSchema = new Schema<IChild>(
  {
    name: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    photo: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

ChildSchema.index({ parentId: 1, name: 1, dob: 1 });

export const Child = model<IChild>('Child', ChildSchema);
