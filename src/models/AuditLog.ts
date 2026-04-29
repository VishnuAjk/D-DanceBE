import { Document, Schema, model } from 'mongoose';
import { logger } from '../middleware/logger';

export interface IAuditLog extends Document {
  actor: Schema.Types.ObjectId;
  action: string;
  resourceType: string;
  resourceId?: Schema.Types.ObjectId;
  branchId?: Schema.Types.ObjectId;
  payload?: Record<string, unknown>;
  ip?: string;
  requestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true, trim: true },
    resourceType: { type: String, required: true, trim: true },
    resourceId: { type: Schema.Types.ObjectId },
    branchId: { type: Schema.Types.ObjectId, index: true },
    payload: { type: Schema.Types.Mixed },
    ip: String,
    requestId: String
  },
  {
    timestamps: true,
    capped: { size: 50 * 1024 * 1024, max: 100000 }
  }
);

AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);

interface LogAuditParams {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  branchId?: string;
  payload?: Record<string, unknown>;
  ip?: string;
  requestId?: string;
}

export async function logAudit(params: LogAuditParams) {
  try {
    await AuditLog.create({
      actor: params.actorId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      branchId: params.branchId,
      payload: params.payload,
      ip: params.ip,
      requestId: params.requestId
    });
  } catch (err) {
    logger.error({ err, action: params.action, requestId: params.requestId }, 'Audit log write failed');
  }
}
