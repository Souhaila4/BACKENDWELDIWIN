import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DangerZoneController } from './danger-zone.controller';
import { DangerZoneService } from './danger-zone.service';
import { DangerZone, DangerZoneSchema } from './schemas/danger-zone.schema';
import { DangerZoneEvent, DangerZoneEventSchema } from './schemas/danger-zone-event.schema';
import { Child, ChildSchema } from '../child/schemas/child.schema';
import { User, UserSchema } from '../user/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DangerZone.name, schema: DangerZoneSchema },
      { name: DangerZoneEvent.name, schema: DangerZoneEventSchema },
      { name: Child.name, schema: ChildSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [DangerZoneController],
  providers: [DangerZoneService],
  exports: [DangerZoneService],
})
export class DangerZoneModule {}

