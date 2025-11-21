import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { ChildModule } from './child/child.module';
import { AuthModule } from './auth/auth.module';
import { MessageModule } from './message/message.module';
import { DangerZoneModule } from './danger-zone/danger-zone.module';
import { TodoModule } from './todo/todo.module';
import { SosAlertModule } from './sos-alert/sos-alert.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(
      (() => {
        const raw = process.env.MONGODB_URI;
        if (!raw) {
          throw new Error('MONGODB_URI environment variable is required');
        }
        // Sanitize common mistakes from dashboard pastes (quotes, key= duplication, whitespace)
        const trimmed = raw.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        const value = trimmed.startsWith('MONGODB_URI=') ? trimmed.split('=')[1] : trimmed;
        if (!value.startsWith('mongodb://') && !value.startsWith('mongodb+srv://')) {
          throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
        }
        return value;
      })(),
      {
        retryWrites: true,
        w: 'majority',
      }
    ),
    AuthModule,
    UserModule,
    ChildModule,
    MessageModule,
    DangerZoneModule,
    TodoModule,
    SosAlertModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
 
  }
}
