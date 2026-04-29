import { Document, Schema, model } from 'mongoose';

type NotificationChannel = 'push' | 'sms' | 'email' | 'whatsapp';
type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface INotificationLog extends Document {
  channel: NotificationChannel;
  status: NotificationStatus;
  template: string;
  recipient: string;
  userId?: Schema.Types.ObjectId;
  branchId?: Schema.Types.ObjectId;
  payload?: Record<string, unknown>;
  externalMessageId?: string;
  errorMessage?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    channel: { type: String, enum: ['push', 'sms', 'email', 'whatsapp'], required: true, index: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending', index: true },
    template: { type: String, required: true, trim: true },
    recipient: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    payload: { type: Schema.Types.Mixed },
    externalMessageId: { type: String, trim: true },
    errorMessage: { type: String, trim: true },
    sentAt: Date
  },
  { timestamps: true }
);

NotificationLogSchema.index({ template: 1, createdAt: -1 });

export const NotificationLog = model<INotificationLog>('NotificationLog', NotificationLogSchema);
