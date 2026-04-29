import { Document, Schema, model } from 'mongoose';

export interface ICourse extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export const Course = model<ICourse>('Course', CourseSchema);
