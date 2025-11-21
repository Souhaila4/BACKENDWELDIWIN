import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SosAlertStatus {
  PENDING = 'PENDING', // SOS triggered, waiting for first call
  CALLING_PARENT = 'CALLING_PARENT', // Currently calling parent
  PARENT_ANSWERED = 'PARENT_ANSWERED', // Parent answered, alert resolved
  PARENT_NO_ANSWER = 'PARENT_NO_ANSWER', // Parent didn't answer
  CALLING_EMERGENCY = 'CALLING_EMERGENCY', // Calling emergency number (196)
  EMERGENCY_CALLED = 'EMERGENCY_CALLED', // Emergency number called
  RESOLVED = 'RESOLVED', // Alert resolved
  CANCELLED = 'CANCELLED', // Alert cancelled
}

export type SosAlertDocument = SosAlert & Document;

@Schema({ timestamps: true })
export class SosAlert {
  @Prop({ type: Types.ObjectId, ref: 'Child', required: true, index: true })
  child: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parent: Types.ObjectId;

  @Prop({ enum: SosAlertStatus, default: SosAlertStatus.PENDING, index: true })
  status: SosAlertStatus;

  @Prop({ type: Number, default: 0 })
  parentCallAttempts: number; // Number of times we tried to call parent

  @Prop({ type: Number, default: 0 })
  emergencyCallAttempts: number; // Number of times we tried to call emergency

  @Prop({
    type: [
      {
        callSid: { type: String },
        phoneNumber: { type: String },
        callType: { type: String, enum: ['PARENT', 'EMERGENCY'] },
        status: { type: String },
        duration: { type: Number },
        answered: { type: Boolean, default: false },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  callHistory: Array<{
    callSid: string;
    phoneNumber: string;
    callType: 'PARENT' | 'EMERGENCY';
    status: string;
    duration?: number;
    answered: boolean;
    timestamp: Date;
  }>;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;

  @Prop({ type: String, default: null })
  resolvedBy: string | null; // Who resolved it (parent ID or 'EMERGENCY')

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>; // Additional data (location, etc.)
}

export const SosAlertSchema = SchemaFactory.createForClass(SosAlert);

// Create index for active alerts
SosAlertSchema.index({ child: 1, status: 1 });
SosAlertSchema.index({ status: 1, createdAt: -1 });

