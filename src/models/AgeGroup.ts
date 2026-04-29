import { Document, Schema, model } from 'mongoose';

export interface IAgeGroup extends Document {
  label: string;
  minAge?: number;
  maxAge?: number;
  createdAt: Date;
  updatedAt: Date;
}

const AgeGroupSchema = new Schema<IAgeGroup>(
  {
    label: { type: String, required: true, trim: true, unique: true },
    minAge: { type: Number, min: 0 },
    maxAge: { type: Number, min: 0 }
  },
  { timestamps: true }
);

AgeGroupSchema.pre('validate', function validateAgeRange(next) {
  if (
    this.minAge !== undefined &&
    this.maxAge !== undefined &&
    this.minAge > this.maxAge
  ) {
    next(new Error('minAge cannot be greater than maxAge'));
    return;
  }

  next();
});

export const AgeGroup = model<IAgeGroup>('AgeGroup', AgeGroupSchema);
