import { Document, Schema, model } from 'mongoose';

export interface IVideo extends Document {
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  tags: string[];
  courseId?: Schema.Types.ObjectId;
  levelId?: Schema.Types.ObjectId;
  branchIds: Schema.Types.ObjectId[];
  isPublished: boolean;
  publishedAt?: Date;
  createdBy?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VideoSchema = new Schema<IVideo>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    videoUrl: { type: String, required: true, trim: true },
    thumbnailUrl: { type: String, trim: true },
    tags: { type: [{ type: String, trim: true }], default: [] },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    levelId: { type: Schema.Types.ObjectId, ref: 'Level', index: true },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

VideoSchema.index({ courseId: 1, levelId: 1, isPublished: 1 });

export const Video = model<IVideo>('Video', VideoSchema);
