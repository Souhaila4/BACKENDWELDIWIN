import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SosAlert, SosAlertSchema } from './schemas/sos-alert.schema';
import { SosAlertService } from './sos-alert.service';
import { SosAlertController } from './sos-alert.controller';
import { Child, ChildSchema } from '../child/schemas/child.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Room, RoomSchema } from '../message/schemas/room.schema';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SosAlert.name, schema: SosAlertSchema },
      { name: Child.name, schema: ChildSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
    forwardRef(() => MessageModule),
  ],
  controllers: [SosAlertController],
  providers: [SosAlertService],
  exports: [SosAlertService],
})
export class SosAlertModule {}

