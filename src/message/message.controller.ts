import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MessageService } from './message.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CloudinaryService } from './cloudinary.service';
import { ChatGateway } from './gateway/chat.gateway';  // ← ADDED

@ApiTags('Messages')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly chatGateway: ChatGateway,  // ← ADDED
  ) {}
  
  private assertObjectId(id: string, name: string) {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      throw new BadRequestException(`${name} must be a 24-char hex Mongo ObjectId`);
    }
  }

  /**
   * Parent: List all rooms (one per child)
   */
  @Get('rooms/parent/:parentId')
  @ApiOperation({ summary: 'List all rooms for a parent (one room per child)' })
  @ApiParam({ name: 'parentId', description: 'Parent User ID' })
  @ApiResponse({ status: 200, description: 'List of rooms with last message preview' })
  async listRoomsForParent(@Param('parentId') parentId: string, @CurrentUser() currentUser: any) {
    this.assertObjectId(parentId, 'parentId');
    return this.messageService.listRoomsForParent(parentId, currentUser);
  }

  /**
   * Child: Get their room with parent
   */
  @Get('room/child/:childId')
  @ApiOperation({ summary: 'Get room for a child (their room with parent)' })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({ status: 200, description: 'Room with parent info and last message' })
  async getRoomForChild(@Param('childId') childId: string, @CurrentUser() currentUser: any) {
    this.assertObjectId(childId, 'childId');
    return this.messageService.getRoomForChild(childId, currentUser);
  }

  /**
   * Get room by ID
   */
  @Get('room/:roomId')
  @ApiOperation({ summary: 'Get room by ID' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({ status: 200, description: 'Room details' })
  async getRoom(@Param('roomId') roomId: string, @CurrentUser() currentUser: any) {
    this.assertObjectId(roomId, 'roomId');
    return this.messageService.getRoomById(roomId, currentUser);
  }

  /**
   * List messages in a room
   */
  @Get('room/:roomId/messages')
  @ApiOperation({ summary: 'List messages in a room (newest first)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max messages (default 50, max 100)' })
  @ApiQuery({ name: 'beforeId', required: false, description: 'Pagination: fetch messages before this message _id' })
  @ApiResponse({ status: 200, description: 'List of messages' })
  async listMessages(
    @Param('roomId') roomId: string,
    @CurrentUser() currentUser: any,
    @Query('limit') limit?: string,
    @Query('beforeId') beforeId?: string,
  ) {
    this.assertObjectId(roomId, 'roomId');
    const parsed = limit ? Number(limit) : 50;
    const parsedLimit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;
    if (beforeId && !/^[a-fA-F0-9]{24}$/.test(beforeId)) {
      throw new BadRequestException('beforeId must be a 24-char hex Mongo ObjectId');
    }
    return this.messageService.listMessages(roomId, currentUser, parsedLimit, beforeId);
  }

  /**
   * List audio (vocal) messages in a room
   */
  @Get('room/:roomId/audio')
  @ApiOperation({ summary: 'List audio (vocal) messages in a room' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiQuery({
    name: 'sender',
    required: false,
    description: 'Filter by sender: parent | child | me | all (default all)',
    enum: ['parent', 'child', 'me', 'all'],
  })
  @ApiResponse({ status: 200, description: 'List of audio messages' })
  async listAudioMessages(
    @Param('roomId') roomId: string,
    @CurrentUser() currentUser: any,
    @Query('sender') sender?: 'parent' | 'child' | 'me' | 'all',
  ) {
    this.assertObjectId(roomId, 'roomId');
    if (sender && !['parent', 'child', 'me', 'all'].includes(sender)) {
      throw new BadRequestException('sender must be parent, child, me, or all');
    }
    return this.messageService.listAudioMessages(roomId, currentUser, { sender });
  }

  /**
   * Send a text message
   */
  @Post('room/:roomId/text')
  @ApiOperation({ summary: 'Send a text message in a room' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', example: 'Hello 👋' },
        senderModel: { type: 'string', enum: ['User', 'Child'], example: 'User' },
        senderId: { type: 'string', example: '665f1c9f6e9a5f0984b2d111' },
      },
      required: ['text', 'senderModel', 'senderId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  async sendText(
    @Param('roomId') roomId: string,
    @Body() body: { text: string; senderModel: 'User' | 'Child'; senderId: string },
    @CurrentUser() currentUser: any,
  ) {
    this.assertObjectId(roomId, 'roomId');
    if (!body?.text || typeof body.text !== 'string') {
      throw new BadRequestException('text is required');
    }
    if (body.senderModel !== 'User' && body.senderModel !== 'Child') {
      throw new BadRequestException('senderModel must be "User" or "Child"');
    }
    this.assertObjectId(body.senderId, 'senderId');
    
    const msg = await this.messageService.sendText(
      {
        roomId,
        text: body.text,
        senderModel: body.senderModel,
        senderId: body.senderId,
      },
      currentUser,
    );

    // ✅ BROADCAST VIA SOCKET.IO FOR REAL-TIME UPDATES
    this.chatGateway.broadcastMessage(roomId, msg);

    return msg;
  }

  /**
   * Send an audio message
   */
  @Post('room/:roomId/audio')
  @ApiOperation({ summary: 'Send an audio message in a room (multipart/form-data)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        senderModel: { type: 'string', enum: ['User', 'Child'], example: 'Child' },
        senderId: { type: 'string', example: '665f1c9f6e9a5f0984b2d222' },
        durationSec: { type: 'number', example: 3.2 },
      },
      required: ['file', 'senderModel', 'senderId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Audio message sent successfully' })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  }))
  async sendAudio(
    @Param('roomId') roomId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { senderModel: 'User' | 'Child'; senderId: string; durationSec?: number },
    @CurrentUser() currentUser: any,
  ) {
    this.assertObjectId(roomId, 'roomId');
    if (!file) {
      throw new BadRequestException('file is required');
    }
    if (body.senderModel !== 'User' && body.senderModel !== 'Child') {
      throw new BadRequestException('senderModel must be "User" or "Child"');
    }
    this.assertObjectId(body.senderId, 'senderId');

    let uploadUrl: string;
    let cloudinaryPublicId: string | null = null;

    if (this.cloudinaryService.enabled()) {
      try {
        const uploadResult = await this.cloudinaryService.uploadAudio(file, {
          folder: `weldiwin/messages/rooms/${roomId}`,
        });
        uploadUrl = uploadResult.secure_url ?? uploadResult.url;
        cloudinaryPublicId = uploadResult.public_id ?? null;
      } catch (error: any) {
        throw new InternalServerErrorException(
          `Failed to upload audio to Cloudinary: ${error?.message ?? 'Unknown error'}`,
        );
      }
    } else {
      // Fall back to base64 data URL (primarily for local/serverless development)
      const base64Data = file.buffer.toString('base64');
      uploadUrl = `data:${file.mimetype};base64,${base64Data}`;
    }

    const durationValue =
      typeof body.durationSec === 'string'
        ? Number(body.durationSec)
        : typeof body.durationSec === 'number'
          ? body.durationSec
          : null;

    const msg = await this.messageService.sendAudio(
      {
        roomId,
        senderModel: body.senderModel,
        senderId: body.senderId,
        audio: {
          url: uploadUrl,
          durationSec: durationValue && Number.isFinite(durationValue) ? durationValue : null,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          cloudinaryPublicId,
        },
      },
      currentUser,
    );

    // ✅ BROADCAST VIA SOCKET.IO FOR REAL-TIME UPDATES
    this.chatGateway.broadcastMessage(roomId, msg);

    return msg;
  }

  /**
   * Send call signaling (WebRTC)
   */
  @Post('room/:roomId/signal')
  @ApiOperation({ summary: 'Send call signaling message (WebRTC offer/answer/ICE)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['CALL_OFFER', 'CALL_ANSWER', 'ICE_CANDIDATE'], example: 'CALL_OFFER' },
        senderModel: { type: 'string', enum: ['User', 'Child'], example: 'User' },
        senderId: { type: 'string', example: '665f1c9f6e9a5f0984b2d111' },
        payload: { type: 'object', example: { sdp: '...', type: 'offer' } },
      },
      required: ['type', 'senderModel', 'senderId', 'payload'],
    },
  })
  @ApiResponse({ status: 201, description: 'Signal sent successfully' })
  async sendSignal(
    @Param('roomId') roomId: string,
    @Body() body: { type: 'CALL_OFFER' | 'CALL_ANSWER' | 'ICE_CANDIDATE'; senderModel: 'User' | 'Child'; senderId: string; payload: Record<string, any> },
    @CurrentUser() currentUser: any,
  ) {
    this.assertObjectId(roomId, 'roomId');
    if (!body.type || !['CALL_OFFER', 'CALL_ANSWER', 'ICE_CANDIDATE'].includes(body.type)) {
      throw new BadRequestException('type must be CALL_OFFER, CALL_ANSWER, or ICE_CANDIDATE');
    }
    if (body.senderModel !== 'User' && body.senderModel !== 'Child') {
      throw new BadRequestException('senderModel must be "User" or "Child"');
    }
    this.assertObjectId(body.senderId, 'senderId');
    if (!body.payload || typeof body.payload !== 'object') {
      throw new BadRequestException('payload is required and must be an object');
    }
    return this.messageService.sendSignal(
      {
        roomId,
        type: body.type,
        senderModel: body.senderModel,
        senderId: body.senderId,
        payload: body.payload,
      },
      currentUser,
    );
  }

  /**
   * Invite a parent to join a room
   */
  @Post('room/:roomId/invite/:parentId')
  @ApiOperation({ summary: 'Invite a parent to join a room (only main parent can invite)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiParam({ name: 'parentId', description: 'Parent User ID to invite' })
  @ApiResponse({ status: 200, description: 'Parent invited successfully' })
  @ApiResponse({ status: 403, description: 'Only main parent can invite' })
  async inviteParent(
    @Param('roomId') roomId: string,
    @Param('parentId') parentId: string,
    @CurrentUser() currentUser: any,
  ) {
    this.assertObjectId(roomId, 'roomId');
    this.assertObjectId(parentId, 'parentId');
    return this.messageService.inviteParent(roomId, parentId, currentUser);
  }

  /**
   * Remove an invited parent from a room
   */
  @Delete('room/:roomId/invite/:parentId')
  @ApiOperation({ summary: 'Remove an invited parent from a room (only main parent can remove)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiParam({ name: 'parentId', description: 'Parent User ID to remove' })
  @ApiResponse({ status: 200, description: 'Parent removed successfully' })
  @ApiResponse({ status: 403, description: 'Only main parent can remove' })
  async removeInvitedParent(
    @Param('roomId') roomId: string,
    @Param('parentId') parentId: string,
    @CurrentUser() currentUser: any,
  ) {
    this.assertObjectId(roomId, 'roomId');
    this.assertObjectId(parentId, 'parentId');
    return this.messageService.removeInvitedParent(roomId, parentId, currentUser);
  }

  /**
   * Delete a message from a room
   * Only the sender can delete their own message
   */
  @Delete('message/:messageId')
  @ApiOperation({ summary: 'Delete a message (only sender can delete their own message)' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message deleted successfully' })
  @ApiResponse({ status: 403, description: 'You can only delete your own messages' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() currentUser: any,
  ) {
    this.assertObjectId(messageId, 'messageId');
    
    // Get message to find room ID for broadcasting
    const message = await this.messageService.getMessageById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    
    // Delete the message
    await this.messageService.deleteMessage(messageId, currentUser);
    
    // Broadcast deletion via WebSocket
    this.chatGateway.broadcastMessageDeleted(message.room.toString(), messageId);
    
    return { success: true, message: 'Message deleted successfully' };
  }
}