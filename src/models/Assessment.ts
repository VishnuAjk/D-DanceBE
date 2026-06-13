import { Document, Schema, model } from 'mongoose';

interface ISkillScore {
  skill: string;
  score: number;
  notes?: string;
}

export interface IAssessment extends Document {
  studentProfileId: Schema.Types.ObjectId;
  batchId: Schema.Types.ObjectId;
  branchId: Schema.Types.ObjectId;
  levelId?: Schema.Types.ObjectId;
  assessedBy: Schema.Types.ObjectId;
  assessedAt: Date;
  sharedWithCustomer: boolean;
  sharedAt?: Date;
  overallScore?: number;
  remarks?: string;
  skillScores: ISkillScore[];
  createdAt: Date;
  updatedAt: Date;
}

const SkillScoreSchema = new Schema<ISkillScore>(
  {
    skill: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    notes: { type: String, trim: true }
  },
  { _id: false }
);

const AssessmentSchema = new Schema<IAssessment>(
  {
    studentProfileId: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    levelId: { type: Schema.Types.ObjectId, ref: 'Level' },
    assessedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assessedAt: { type: Date, required: true, default: Date.now, index: true },
    sharedWithCustomer: { type: Boolean, default: false, index: true },
    sharedAt: { type: Date },
    overallScore: { type: Number, min: 0, max: 100 },
    remarks: { type: String, trim: true },
    skillScores: { type: [SkillScoreSchema], default: [] }
  },
  { timestamps: true }
);

AssessmentSchema.index({ studentProfileId: 1, batchId: 1, assessedAt: -1 });

export const Assessment = model<IAssessment>('Assessment', AssessmentSchema);
