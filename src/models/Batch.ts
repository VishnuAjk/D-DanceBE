import { Document, Schema, model } from 'mongoose';

type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

interface IBatchSchedule {
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
}

export interface IBatch extends Document {
  name: string;
  branchId: Schema.Types.ObjectId;
  courseId: Schema.Types.ObjectId;
  levelId?: Schema.Types.ObjectId;
  ageGroupId?: Schema.Types.ObjectId;
  instructorIds: Schema.Types.ObjectId[];
  schedule: IBatchSchedule;
  capacity: number;
  monthlyFee: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BatchScheduleSchema = new Schema<IBatchSchedule>(
  {
    days: {
      type: [{ type: String, enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] }],
      required: true,
      validate: [(value: DayOfWeek[]) => value.length > 0, 'At least one schedule day is required']
    },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ }
  },
  { _id: false }
);

const BatchSchema = new Schema<IBatch>(
  {
    name: { type: String, required: true, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    levelId: { type: Schema.Types.ObjectId, ref: 'Level' },
    ageGroupId: { type: Schema.Types.ObjectId, ref: 'AgeGroup' },
    instructorIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    schedule: { type: BatchScheduleSchema, required: true },
    capacity: { type: Number, required: true, min: 1 },
    monthlyFee: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

BatchSchema.index({ branchId: 1, name: 1 }, { unique: true });

export const Batch = model<IBatch>('Batch', BatchSchema);
