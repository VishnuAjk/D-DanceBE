import type { UserRoleType } from '@danceapp/shared';
import { Document, Schema, model } from 'mongoose';

export interface IUser extends Document {
  phone: string;
  name: string;
  role: UserRoleType;
  branchIds: Schema.Types.ObjectId[];
  status: 'active' | 'inactive' | 'suspended';
  fcmTokens: Array<{ token: string; createdAt: Date }>;
  webPushSubscriptions: Array<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
    createdAt: Date;
  }>;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    phone: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['super_admin', 'branch_admin', 'instructor', 'customer', 'parent'],
      required: true
    },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active'
    },
    fcmTokens: [
      {
        token: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    webPushSubscriptions: [
      {
        endpoint: { type: String, required: true },
        keys: {
          p256dh: { type: String, required: true },
          auth: { type: String, required: true }
        },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    lastLoginAt: Date
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
UserSchema.index({ branchIds: 1 });

export const User = model<IUser>('User', UserSchema);
