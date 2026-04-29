import { Document, Schema, model } from 'mongoose';

export interface ILevel extends Document {
  name: string;
  courseId: Schema.Types.ObjectId;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const LevelSchema = new Schema<ILevel>(
  {
    name: { type: String, required: true, trim: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    order: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

LevelSchema.index({ courseId: 1, order: 1 }, { unique: true });
LevelSchema.index({ courseId: 1, name: 1 }, { unique: true });

export const Level = model<ILevel>('Level', LevelSchema);
