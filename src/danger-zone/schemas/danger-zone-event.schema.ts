import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Child } from '../../child/schemas/child.schema';
import { DangerZone } from './danger-zone.schema';

export type DangerZoneEventDocument = DangerZoneEvent & Document;

export enum DangerZoneEventType {
  ENTER = 'ENTER',
  EXIT = 'EXIT',
}

@Schema({ timestamps: true })
export class DangerZoneEvent {
  @Prop({ type: Types.ObjectId, ref: 'Child', required: true })
  child: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'DangerZone', required: true })
  dangerZone: Types.ObjectId;

  @Prop({ enum: DangerZoneEventType, required: true })
  type: DangerZoneEventType;

  @Prop({
    type: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    required: true,
  })
  location: { lat: number; lng: number };

  @Prop({ default: false })
  notificationSent: boolean;
}

export const DangerZoneEventSchema = SchemaFactory.createForClass(DangerZoneEvent);

// Indexes for efficient queries
DangerZoneEventSchema.index({ child: 1, dangerZone: 1, createdAt: -1 });
DangerZoneEventSchema.index({ dangerZone: 1, createdAt: -1 });

