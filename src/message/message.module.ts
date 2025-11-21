import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { Message, MessageSchema } from './schemas/message.schema';
import { Room, RoomSchema } from './schemas/room.schema';
import { Child, ChildSchema } from '../child/schemas/child.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { ChatGateway } from './gateway/chat.gateway';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Child.name, schema: ChildSchema },
      { name: User.name, schema: UserSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
        return {
          secret,
          signOptions: { expiresIn: '7d' },
        };
      },
    }),
  ],
  controllers: [MessageController],
  providers: [MessageService, ChatGateway, CloudinaryService],
  exports: [MessageService, ChatGateway],
})
export class MessageModule {}

