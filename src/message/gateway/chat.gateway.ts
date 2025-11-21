import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MessageService } from '../message.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly messageService: MessageService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log('🔌 New WebSocket connection attempt');
    this.logger.debug(`   Client ID: ${client.id}`);
    this.logger.debug(`   Handshake auth: ${JSON.stringify(client.handshake.auth)}`);
    this.logger.debug(`   Handshake query: ${JSON.stringify(client.handshake.query)}`);
    this.logger.debug(`   Handshake headers: ${JSON.stringify(client.handshake.headers)}`);

    // Extract token from handshake auth or query
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    this.logger.debug(`   Token present: ${!!token}`);
    this.logger.debug(`   Token value (first 50 chars): ${typeof token === 'string' ? token.substring(0, 50) : 'not a string'}`);

    if (token) {
      try {
        const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
        this.logger.debug(`   JWT Secret (first 20 chars): ${secret.substring(0, 20)}...`);
        
        const payload = this.jwtService.verify(token as string, { secret });
        client.data.user = payload;
        
        this.logger.log(`✅ Client authenticated: ${payload.sub || payload._id || payload.id}`);
        this.logger.debug(`   User role: ${payload.role}`);
        this.logger.debug(`   Full payload: ${JSON.stringify(payload)}`);
      } catch (error) {
        this.logger.warn(`⚠️ WebSocket connection with invalid token: ${error.message}`);
        this.logger.error(error.stack);
      }
    } else {
      this.logger.warn('⚠️ WebSocket connection without token');
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.user?.sub || client.data.user?._id || client.data.user?.id;
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
    if (userId) {
      this.logger.debug(`   User ID: ${userId}`);
    }
  }

  /**
   * Join a room by roomId
   */
  @SubscribeMessage('joinRoom')
  async onJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any, // Changed to 'any' to accept any payload structure
  ) {
    this.logger.log('📱 joinRoom received');
    this.logger.debug(`   Raw data: ${JSON.stringify(data)}`);
    this.logger.debug(`   Client ID: ${client.id}`);
    this.logger.debug(`   User ID: ${client.data.user?.sub || client.data.user?._id || client.data.user?.id || 'unknown'}`);

    // Extract roomId from different possible payload structures
    const roomId = data.roomId || data.room;
    
    if (!roomId) {
      this.logger.error('❌ No roomId provided in joinRoom');
      return { error: 'roomId is required' };
    }

    if (!client.data.user) {
      this.logger.warn('❌ Unauthorized joinRoom attempt');
      return { error: 'Unauthorized' };
    }

    try {
      client.join(`room:${roomId}`);
      
      this.logger.log(`✅ Client ${client.id.substring(0, 8)}... joined room:${roomId.substring(0, 8)}...`);
      
      this.server.to(`room:${roomId}`).emit('presence', { 
        userId: client.id, 
        state: 'joined', 
        roomId: roomId 
      });
      
      return { ok: true, roomId: roomId };
    } catch (error) {
      this.logger.error(`❌ Failed to join room: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Leave a room by roomId
   */
  @SubscribeMessage('leaveRoom')
  async onLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    this.logger.log('👋 leaveRoom received');
    this.logger.debug(`   Room ID: ${data.roomId}`);
    this.logger.debug(`   Client ID: ${client.id}`);

    try {
      client.leave(`room:${data.roomId}`);
      
      this.logger.log(`✅ Client left room:${data.roomId}`);
      
      this.server.to(`room:${data.roomId}`).emit('presence', { 
        userId: client.id, 
        state: 'left', 
        roomId: data.roomId 
      });
      
      return { ok: true, roomId: data.roomId };
    } catch (error) {
      this.logger.error(`❌ Failed to leave room: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Send a text message via WebSocket (real-time)
   * Also handles WebRTC signaling (call-request, call_offer, call_answer, ice_candidate)
   */
  @SubscribeMessage('sendText')
  async onSendText(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    this.logger.log('🔵🔵🔵 sendText received!');
    this.logger.debug(`   Raw body: ${JSON.stringify(body, null, 2)}`);
    this.logger.debug(`   Client user: ${JSON.stringify(client.data.user)}`);
    this.logger.debug(`   Sender ID: ${client.data.user?.sub || client.data.user?._id || client.data.user?.id || 'unknown'}`);

    if (!client.data.user) {
      this.logger.warn('❌ Unauthorized sendText attempt');
      return { error: 'Unauthorized' };
    }

    try {
      // Check if this is a WebRTC signaling message
      if (body.messageType === 'webrtc_signal') {
        this.logger.log(`🔊 Relaying WebRTC signal: ${body.signalType}`);
        this.logger.debug(`   Room: ${body.roomId}`);
        this.logger.debug(`   Sender: ${body.senderId}`);
        this.logger.debug(`   Target: ${body.targetId}`);
        
        // Broadcast to room EXCEPT sender
        client.to(`room:${body.roomId}`).emit('newMessage', body);
        
        this.logger.log('✅ WebRTC signal relayed');
        return { ok: true, type: 'webrtc_signal' };
      }
      
      // Regular text message - save to DB and broadcast
      this.logger.log('💾 Saving regular message to DB...');
      this.logger.debug(`   Room ID: ${body.roomId}`);
      this.logger.debug(`   Text content: ${body.text || body.content}`);
      
      // ✅ Normalize the payload structure - backend expects "text" not "content"
      const messagePayload = {
        roomId: body.roomId,
        text: body.text || body.content,  // ⚠️ Backend expects "text"
        senderModel: body.senderModel,
        senderId: body.senderId,
      };
      
      this.logger.debug(`   Normalized payload: ${JSON.stringify(messagePayload)}`);
      
      const msg = await this.messageService.sendText(messagePayload, client.data.user);
      
      this.logger.log('✅ Message saved to DB');
      this.logger.debug(`   Message ID: ${msg._id || msg.id}`);
      
      const roomName = `room:${body.roomId}`;
      this.logger.log(`📡 Broadcasting to: ${roomName}`);
      
      this.server.to(roomName).emit('newMessage', msg);
      
      this.logger.log('🎉🎉🎉 newMessage broadcasted successfully!');
      this.logger.debug(`   Broadcasted to room: ${body.roomId}`);
      
      return msg;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send text message: ${error.message}`);
      this.logger.error(error.stack);
      return { error: error.message };
    }
  }

  /**
   * Send call signaling (WebRTC offer/answer/ICE)
   */
  @SubscribeMessage('signal')
  async onSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      roomId: string;
      senderModel: 'User' | 'Child';
      senderId: string;
      type: 'CALL_OFFER' | 'CALL_ANSWER' | 'ICE_CANDIDATE';
      payload: Record<string, any>;
    },
  ) {
    this.logger.log('📞 [Gateway] WebRTC signal received');
    this.logger.debug(`   Type: ${body.type}`);
    this.logger.debug(`   Room: ${body.roomId}`);
    this.logger.debug(`   Sender: ${body.senderId} (${body.senderModel})`);
    this.logger.debug(`   Payload keys: ${Object.keys(body.payload || {}).join(', ')}`);
    this.logger.debug(`   Payload preview: ${JSON.stringify(body.payload).substring(0, 100)}...`);

    if (!client.data.user) {
      this.logger.warn('❌ Unauthorized signal');
      return { error: 'Unauthorized' };
    }

    try {
      // Sauvegarder en DB
      this.logger.log('💾 [Gateway] Saving signal to DB...');
      this.logger.debug(`   Client ID: ${client.id}`);
      this.logger.debug(`   Current User: ${client.data.user.sub || client.data.user.id || client.data.user._id}`);
      
      const message = await this.messageService.sendSignal(
        {
          roomId: body.roomId,
          senderModel: body.senderModel,
          senderId: body.senderId,
          type: body.type,
          payload: body.payload,
        },
        client.data.user,
      );
      
      this.logger.log('✅ [Gateway] Signal saved to DB');
      this.logger.debug(`   Message ID: ${message._id || message.id}`);
      this.logger.debug(`   Message Type: ${message.type}`);
      
      // CRITIQUE : Broadcaster à tous SAUF l'expéditeur
      const roomName = `room:${body.roomId}`;
      
      this.logger.log(`📡 [Gateway] Broadcasting signal to ${roomName}`);
      this.logger.debug(`   Client ID: ${client.id}`);
      this.logger.debug(`   Broadcasting to all except sender`);
      this.logger.debug(`   Using client.to() to exclude sender`);
      
      // Utiliser .to() pour broadcast à la room sans l'expéditeur
      client.to(roomName).emit('signal', {
        ...message,
        // Ajouter des infos pour le frontend
        signalType: body.type,
        from: body.senderId,
      });
      
      this.logger.log('✅ [Gateway] Signal broadcasted successfully');
      this.logger.debug(`   Event: 'signal'`);
      this.logger.debug(`   Room: ${roomName}`);
      this.logger.debug(`   Excluded sender: ${client.id}`);
      
      return { ok: true, message };
    } catch (error: any) {
      this.logger.error(`❌ [Gateway] Signal failed: ${error.message}`);
      this.logger.error(`   Error stack: ${error.stack}`);
      return { error: error.message };
    }
  }

  /**
   * Broadcast a message to a room (can be called from REST API)
   * This ensures messages sent via REST API also appear in real-time
   */
  broadcastMessage(roomId: string, message: any) {
    this.logger.log('📨 Broadcasting message from REST API');
    this.logger.debug(`   Room: ${roomId}`);
    this.logger.debug(`   Message type: ${message.messageType || 'text'}`);
    
    this.server.to(`room:${roomId}`).emit('newMessage', message);
    
    this.logger.log(`✅ Broadcasted message to room:${roomId}`);
  }

  /**
   * Broadcast message deletion to a room (can be called from REST API)
   * This ensures message deletions are reflected in real-time
   */
  broadcastMessageDeleted(roomId: string, messageId: string) {
    this.logger.log('🗑️ Broadcasting message deletion from REST API');
    this.logger.debug(`   Room: ${roomId}`);
    this.logger.debug(`   Message ID: ${messageId}`);
    
    this.server.to(`room:${roomId}`).emit('messageDeleted', {
      messageId,
      roomId,
    });
    
    this.logger.log(`✅ Broadcasted message deletion to room:${roomId}`);
  }
}