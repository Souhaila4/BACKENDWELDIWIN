import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ChildService } from './child.service';
import { ChildController } from './child.controller';
import { Child, ChildSchema } from './schemas/child.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Room, RoomSchema } from '../message/schemas/room.schema';
import { Message, MessageSchema } from '../message/schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Child.name, schema: ChildSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [ChildController],
  providers: [ChildService],
  exports: [ChildService],
})
export class ChildModule implements OnModuleInit {
  constructor(@InjectConnection() private connection: Connection) {}

  async onModuleInit() {
    try {
      const collection = this.connection.collection('children');
      
      // Try to drop the old email_1 index if it exists
      await collection.dropIndex('email_1');
      console.log('✅ Dropped obsolete email_1 index from children collection');
    } catch (error: any) {
      // Ignore if index doesn't exist (code 27 = IndexNotFound)
      if (error.code !== 27 && error.codeName !== 'IndexNotFound') {
        console.error('Error dropping email index:', error.message);
      }
    }
  }
}
