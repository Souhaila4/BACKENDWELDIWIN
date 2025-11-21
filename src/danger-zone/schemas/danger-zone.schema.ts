import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../user/schemas/user.schema';
import { Child } from '../../child/schemas/child.schema';

export type DangerZoneDocument = DangerZone & Document;

export enum DangerZoneStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Schema({ timestamps: true })
export class DangerZone {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parent: Types.ObjectId;

  @Prop({
    type: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    required: true,
  })
  center: { lat: number; lng: number };

  @Prop({ required: true, min: 10, max: 50000 }) // radius in meters (10m to 50km)
  radiusMeters: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Child' }], default: [] })
  children: Types.ObjectId[]; // if empty, applies to all parent's children

  @Prop({ enum: DangerZoneStatus, default: DangerZoneStatus.ACTIVE })
  status: DangerZoneStatus;

  @Prop({ default: true })
  notifyOnEntry: boolean;

  @Prop({ default: false })
  notifyOnExit: boolean;
}

export const DangerZoneSchema = SchemaFactory.createForClass(DangerZone);

// Index for efficient parent queries
DangerZoneSchema.index({ parent: 1, status: 1 });

