import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import mongoose from 'mongoose';
import { Room, RoomDocument } from './schemas/room.schema';
import { Message, MessageDocument, MessageType } from './schemas/message.schema';
import { Child, ChildDocument } from '../child/schemas/child.schema';
import { User, UserDocument, UserRole } from '../user/schemas/user.schema';
import { CloudinaryService } from './cloudinary.service';

interface SendTextDto {
  roomId: string;
  text: string;
  senderModel: 'User' | 'Child';
  senderId: string;
}

interface SendAudioDto {
  roomId: string;
  senderModel: 'User' | 'Child';
  senderId: string;
  audio: {
    url: string;
    durationSec?: number | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    cloudinaryPublicId?: string | null;
  };
}

interface SendSignalDto {
  roomId: string;
  senderModel: 'User' | 'Child';
  senderId: string;
  type: 'CALL_OFFER' | 'CALL_ANSWER' | 'ICE_CANDIDATE';
  payload: Record<string, any>;
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Child.name) private readonly childModel: Model<ChildDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * ✅ FIX: Extract user ID from JWT payload (handles both 'sub' and 'id')
   * Prioritizes 'id' since JWT strategy returns 'id' after validation
   */
  private getUserId(user: any): string {
    // After JWT validation, user object has 'id' field (from jwt.strategy.ts)
    // Prioritize 'id' over 'sub' to handle both validated and raw JWT payloads
    return user.id || user.sub || user._id?.toString() || user._id;
  }

  /**
   * ✅ FIX: Extract child ID from room.child (handles both populated and non-populated)
   * When populated, room.child is a Child document object, so extract _id
   * When not populated, room.child is an ObjectId
   */
  private getChildId(room: RoomDocument): Types.ObjectId {
    const child = room.child as any;
    if (child?._id) {
      // Populated: child is a Child document object
      return new Types.ObjectId(child._id);
    }
    // Not populated: child is already an ObjectId
    return child instanceof Types.ObjectId ? child : new Types.ObjectId(child);
  }

  /**
   * Get or create a room for a parent-child pair
   */
  async getOrCreateRoom(parentId: string, childId: string): Promise<RoomDocument> {
    const parentObjectId = new Types.ObjectId(parentId);
    const childObjectId = new Types.ObjectId(childId);

    // Verify child exists and is linked to parent
    const child = await this.childModel.findById(childId);
    if (!child) {
      throw new NotFoundException('Child not found');
    }
    const isLinked =
      child.parent?.equals(parentObjectId) ||
      (Array.isArray(child.linkedParents) && child.linkedParents.some((p) => p.equals(parentObjectId)));
    if (!isLinked) {
      throw new ForbiddenException('Parent is not linked to this child');
    }

    // Find or create room
    let room = await this.roomModel
      .findOne({ parent: parentObjectId, child: childObjectId })
      .populate('child', 'firstName lastName avatarUrl')
      .populate('parent', 'firstName lastName avatarUrl')
      .populate('invitedParents', 'firstName lastName avatarUrl');
    if (!room) {
      await this.roomModel.create({
        parent: parentObjectId,
        child: childObjectId,
        isActive: true,
      });
      // Refetch with populate after creation
      room = await this.roomModel
        .findOne({ parent: parentObjectId, child: childObjectId })
        .populate('child', 'firstName lastName avatarUrl')
        .populate('parent', 'firstName lastName avatarUrl')
        .populate('invitedParents', 'firstName lastName avatarUrl');
      if (!room) {
        throw new Error('Failed to create room');
      }
    } else if (!room.isActive) {
      room.isActive = true;
      await room.save();
      // Refetch with populate after update
      room = await this.roomModel
        .findById(room._id)
        .populate('child', 'firstName lastName avatarUrl')
        .populate('parent', 'firstName lastName avatarUrl')
        .populate('invitedParents', 'firstName lastName avatarUrl');
      if (!room) {
        throw new Error('Failed to refetch room');
      }
    }
    return room;
  }

  /**
   * ✅ FIXED: Assert user has access to room
   */
  private async assertRoomAccess(room: RoomDocument, currentUser: any): Promise<void> {
    if (currentUser.role === UserRole.ADMIN) {
      return; // Admin can access any room
    }

    // ✅ FIX: Extract user ID properly (handles both JWT payload 'sub' and validated 'id')
    const userId = this.getUserId(currentUser);
    
    this.logger.debug(`[assertRoomAccess] Checking access for user: ${userId}`);
    this.logger.debug(`[assertRoomAccess] User type: ${currentUser.type}`);
    this.logger.debug(`[assertRoomAccess] Current user object: ${JSON.stringify({ sub: currentUser.sub, id: currentUser.id, _id: currentUser._id })}`);
    this.logger.debug(`[assertRoomAccess] Room parent: ${room.parent.toString()}`);
    this.logger.debug(`[assertRoomAccess] Room child: ${this.getChildId(room).toString()}`);
    this.logger.debug(`[assertRoomAccess] Invited parents: ${room.invitedParents?.map(p => p.toString())}`);

    if (currentUser.type === 'child') {
      // Child can only access their own room
      const roomChildId = this.getChildId(room).toString();
      const userChildId = userId.toString();
      
      this.logger.debug(`[assertRoomAccess] Comparing child IDs - Room: ${roomChildId}, User: ${userChildId}`);
      this.logger.debug(`[assertRoomAccess] Room.child type: ${typeof room.child}, is populated: ${!!(room.child as any)?._id}`);
      
      if (roomChildId !== userChildId) {
        this.logger.error(`[assertRoomAccess] Child ID mismatch - Room child: ${roomChildId}, User ID: ${userChildId}`);
        throw new ForbiddenException('You can only access your own room');
      }
    } else {
      // Parent can access if they are:
      // 1. The main parent
      // 2. An invited parent
      const userObjectId = new Types.ObjectId(userId);
      const isMainParent = room.parent.equals(userObjectId);
      const isInvitedParent = Array.isArray(room.invitedParents) && 
        room.invitedParents.some((p) => p.equals(userObjectId));
      
      this.logger.debug(`[assertRoomAccess] Is main parent: ${isMainParent}`);
      this.logger.debug(`[assertRoomAccess] Is invited parent: ${isInvitedParent}`);
      
      if (!isMainParent && !isInvitedParent) {
        throw new ForbiddenException('You can only access rooms with your children or rooms you are invited to');
      }
    }
    
    this.logger.log(`✅ [assertRoomAccess] Access granted for user: ${userId}`);
  }

  /**
   * ✅ NEW: Simplified access check for WebRTC signaling
   * Only checks if the sender is a participant of the room (child OR parent)
   */
  private isRoomParticipant(room: RoomDocument, senderModel: 'User' | 'Child', senderId: string): boolean {
  const senderObjectId = new Types.ObjectId(senderId);
  
  if (senderModel === 'Child') {
    const roomChildId = this.getChildId(room);
    return roomChildId.equals(senderObjectId);
  } else {
    const isMainParent = room.parent.equals(senderObjectId);
    const isInvitedParent = Array.isArray(room.invitedParents) && 
      room.invitedParents.some((p) => p.equals(senderObjectId));
    return isMainParent || isInvitedParent;
  }
}

  /**
   * List all rooms for a parent (one per child)
   * Includes rooms where user is main parent OR invited parent
   */
  async listRoomsForParent(parentId: string, currentUser: any): Promise<any[]> {
    const userId = this.getUserId(currentUser);
    if (currentUser.role !== UserRole.ADMIN && userId !== parentId) {
      throw new ForbiddenException('You can only view your own rooms');
    }
    const parentObjectId = new Types.ObjectId(parentId);
    return this.roomModel
      .find({
        $or: [
          { parent: parentObjectId, isActive: true },
          { invitedParents: parentObjectId, isActive: true },
        ],
      })
      .populate('child', 'firstName lastName avatarUrl')
      .populate('parent', 'firstName lastName avatarUrl')
      .populate('invitedParents', 'firstName lastName avatarUrl')
      .sort({ 'lastMessage.createdAt': -1 })
      .lean();
  }

  /**
   * Get room for a child (their room with parent)
   */
  async getRoomForChild(childId: string, currentUser: any): Promise<RoomDocument> {
    if (currentUser.type !== 'child') {
      throw new ForbiddenException('This endpoint is only for children');
    }
    const userId = this.getUserId(currentUser);
    if (userId !== childId) {
      throw new ForbiddenException('You can only access your own room');
    }

    const child = await this.childModel.findById(childId);
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    const room = await this.roomModel
      .findOne({ child: new Types.ObjectId(childId), isActive: true })
      .populate('child', 'firstName lastName avatarUrl')
      .populate('parent', 'firstName lastName avatarUrl')
      .populate('invitedParents', 'firstName lastName avatarUrl');

    if (!room) {
      // Auto-create room if it doesn't exist
      return this.getOrCreateRoom(child.parent.toString(), childId);
    }

    return room;
  }

  /**
   * Get room by ID with access check
   */
  async getRoomById(roomId: string, currentUser: any): Promise<RoomDocument> {
    const room = await this.roomModel
      .findById(roomId)
      .populate('child', 'firstName lastName avatarUrl')
      .populate('parent', 'firstName lastName avatarUrl')
      .populate('invitedParents', 'firstName lastName avatarUrl');
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    await this.assertRoomAccess(room, currentUser);
    return room;
  }

  /**
   * Invite a parent to join a room
   * Only the main parent can invite other parents
   */
  async inviteParent(roomId: string, invitedParentId: string, currentUser: any): Promise<RoomDocument> {
    const room = await this.roomModel.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const userId = this.getUserId(currentUser);
    // Only main parent can invite
    if (!room.parent.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the main parent can invite other parents');
    }

    // Verify invited parent exists and is a parent
    const invitedParent = await this.userModel.findById(invitedParentId);
    if (!invitedParent) {
      throw new NotFoundException('Invited parent not found');
    }
    if (invitedParent.role !== UserRole.PARENT) {
      throw new ForbiddenException('Can only invite users with PARENT role');
    }

    // Check if already invited
    const invitedParentObjectId = new Types.ObjectId(invitedParentId);
    if (room.parent.equals(invitedParentObjectId)) {
      throw new ForbiddenException('Cannot invite the main parent');
    }
    if (Array.isArray(room.invitedParents) && room.invitedParents.some((p) => p.equals(invitedParentObjectId))) {
      throw new ForbiddenException('Parent is already invited to this room');
    }

    // Add to invited parents using $addToSet to avoid duplicates
    await this.roomModel.findByIdAndUpdate(roomId, {
      $addToSet: { invitedParents: invitedParentObjectId },
    });

    // Return updated room with populated fields
    const updatedRoom = await this.roomModel
      .findById(roomId)
      .populate('child', 'firstName lastName avatarUrl')
      .populate('parent', 'firstName lastName avatarUrl')
      .populate('invitedParents', 'firstName lastName avatarUrl');
    
    if (!updatedRoom) {
      throw new NotFoundException('Room not found after update');
    }
    return updatedRoom;
  }

  /**
   * Remove an invited parent from a room
   * Only the main parent can remove invited parents
   */
  async removeInvitedParent(roomId: string, invitedParentId: string, currentUser: any): Promise<RoomDocument> {
    const room = await this.roomModel.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const userId = this.getUserId(currentUser);
    // Only main parent can remove
    if (!room.parent.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the main parent can remove invited parents');
    }

    const invitedParentObjectId = new Types.ObjectId(invitedParentId);
    
    // Remove from invited parents
    await this.roomModel.findByIdAndUpdate(roomId, {
      $pull: { invitedParents: invitedParentObjectId },
    });

    // Return updated room with populated fields
    const updatedRoom = await this.roomModel
      .findById(roomId)
      .populate('child', 'firstName lastName avatarUrl')
      .populate('parent', 'firstName lastName avatarUrl')
      .populate('invitedParents', 'firstName lastName avatarUrl');
    
    if (!updatedRoom) {
      throw new NotFoundException('Room not found after update');
    }
    return updatedRoom;
  }

  /**
   * Validate that sender is authorized for this room
   * Allows: child (matching room.child), main parent, invited parent, or linked parent of the room's child
   */
  private async validateSender(
    room: RoomDocument,
    senderModel: 'User' | 'Child',
    senderId: string,
  ): Promise<void> {
    const senderObjectId = new Types.ObjectId(senderId);

    if (senderModel === 'Child') {
      // Child must match the room's child
      const roomChildId = this.getChildId(room);
      if (!room || !roomChildId || !roomChildId.equals(senderObjectId)) {
        throw new ForbiddenException('senderId must match the child in this room');
      }
      return;
    }

    // senderModel === 'User' (parent)
    const isMainParent = !!room.parent && room.parent.equals(senderObjectId);
    const isInvitedParent = Array.isArray(room.invitedParents) &&
      room.invitedParents.some((p: any) => new Types.ObjectId(p).equals(senderObjectId));

    if (isMainParent || isInvitedParent) {
      return;
    }

    // Fallback: allow linked parent of the room's child
    const roomChildId = this.getChildId(room);
    const childDoc = await this.childModel.findById(roomChildId).select('_id linkedParents');
    if (childDoc && Array.isArray((childDoc as any).linkedParents)) {
      const isLinked = (childDoc as any).linkedParents.some((p: any) => new mongoose.Types.ObjectId(p).equals(senderObjectId));
      if (isLinked) return;
    }

    throw new ForbiddenException('senderId must be the main parent, an invited parent, or a linked parent of the child in this room');
  }

  /**
   * Get a message by ID (for internal use)
   */
  async getMessageById(messageId: string): Promise<any> {
    return this.messageModel.findById(messageId).lean();
  }

  /**
   * List messages in a room
   */
  async listMessages(roomId: string, currentUser: any, limit = 50, beforeId?: string): Promise<any[]> {
    const room = await this.roomModel.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    await this.assertRoomAccess(room, currentUser);

    const query: any = { room: new Types.ObjectId(roomId) };
    if (beforeId) {
      query._id = { $lt: new Types.ObjectId(beforeId) };
    }
    return this.messageModel.find(query).sort({ _id: -1 }).limit(limit).lean();
  }

  /**
   * List audio (vocal) messages in a room with optional sender filters
   */
  async listAudioMessages(
    roomId: string,
    currentUser: any,
    options?: { sender?: 'parent' | 'child' | 'me' | 'all' },
  ): Promise<any[]> {
    const room = await this.roomModel.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    await this.assertRoomAccess(room, currentUser);

    const query: any = {
      room: room._id,
      type: MessageType.AUDIO,
    };

    const userId = this.getUserId(currentUser);
    switch (options?.sender) {
      case 'parent':
        query.senderModel = 'User';
        break;
      case 'child':
        query.senderModel = 'Child';
        break;
      case 'me':
        query.senderModel = currentUser.type === 'child' ? 'Child' : 'User';
        query.senderId = new Types.ObjectId(userId);
        break;
      default:
        break;
    }

    return this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Send a text message
   */
  async sendReserved(dto: any): Promise<any> { return dto; }
  
  /**
   * ✅ FIXED: Send a text message
   */
  async sendText(dto: SendTextDto, currentUser: any): Promise<any> {
    this.logger.log('📝 [sendText] Sending text message');
    this.logger.debug(`   Room ID: ${dto.roomId}`);
    this.logger.debug(`   Sender ID: ${dto.senderId}`);
    this.logger.debug(`   Text: ${dto.text}`);
    
    const room = await this.roomModel.findById(dto.roomId);
    if (!room) {
      this.logger.error('❌ [sendText] Room not found');
      throw new NotFoundException('Room not found');
    }
    
    this.logger.log('✅ [sendText] Room found, checking access...');
    await this.assertRoomAccess(room, currentUser);

    this.logger.log('✅ [sendText] Access granted, validating sender...');
    // Validate sender (allows main parent, invited parent, linked parent, or child)
    await this.validateSender(room, dto.senderModel, dto.senderId);

    this.logger.log('✅ [sendText] Sender validated, creating message...');
    const msg = await this.messageModel.create({
      room: room._id,
      senderModel: dto.senderModel,
      senderId: new Types.ObjectId(dto.senderId),
      type: MessageType.TEXT,
      text: dto.text,
    });

    this.logger.log('✅ [sendText] Message created, updating room...');
    // Update room's last message
    await this.roomModel.findByIdAndUpdate(room._id, {
      $set: {
        lastMessage: {
          text: dto.text,
          senderModel: dto.senderModel,
          senderId: msg.senderId,
          createdAt: new Date(),
        },
      },
    });

    this.logger.log('✅ [sendText] Message sent successfully');
    return msg.toObject();
  }

  /**
   * Send an audio message
   */
  async sendAudio(dto: SendAudioDto, currentUser: any): Promise<any> {
    const room = await this.roomModel.findById(dto.roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    await this.assertRoomAccess(room, currentUser);

    // Validate sender (allows main parent, invited parent, or child)
    await this.validateSender(room, dto.senderModel, dto.senderId);

    const msg = await this.messageModel.create({
      room: room._id,
      senderModel: dto.senderModel,
      senderId: new Types.ObjectId(dto.senderId),
      type: MessageType.AUDIO,
      audio: dto.audio,
    });

    // Update room's last message
    await this.roomModel.findByIdAndUpdate(room._id, {
      $set: {
        lastMessage: {
          text: '[Audio]',
          senderModel: dto.senderModel,
          senderId: msg.senderId,
          createdAt: new Date(),
        },
      },
    });

    return msg.toObject();
  }

  /**
   * ✅ FIXED: Send call signaling message (WebRTC)
   * Uses simplified access check - only verifies sender is a participant
   */
  async sendSignal(dto: SendSignalDto, currentUser: any): Promise<any> {
    this.logger.log(`📞 [Service] Signaling: ${dto.type}`);
    this.logger.debug(`   Room ID: ${dto.roomId}`);
    this.logger.debug(`   Sender ID: ${dto.senderId}`);
    this.logger.debug(`   Sender Model: ${dto.senderModel}`);
    this.logger.debug(`   Signal Type: ${dto.type}`);
    
    // Vérifier que le type est correct
    if (!['CALL_OFFER', 'CALL_ANSWER', 'ICE_CANDIDATE'].includes(dto.type)) {
      this.logger.error(`❌ [Service] Invalid signal type: ${dto.type}`);
      throw new BadRequestException('Invalid signal type. Must be CALL_OFFER, CALL_ANSWER, or ICE_CANDIDATE');
    }

    // Vérifier la structure du payload selon le type
    if (dto.type === 'CALL_OFFER' || dto.type === 'CALL_ANSWER') {
      if (!dto.payload.sdp) {
        this.logger.error(`❌ [Service] Missing SDP in ${dto.type} payload`);
        throw new BadRequestException(`${dto.type} must contain an SDP in the payload`);
      }
      this.logger.debug(`   SDP type: ${dto.payload.type || 'unknown'}`);
      this.logger.debug(`   SDP preview: ${JSON.stringify(dto.payload.sdp).substring(0, 50)}...`);
    } else if (dto.type === 'ICE_CANDIDATE') {
      if (!dto.payload.candidate) {
        this.logger.error(`❌ [Service] Missing candidate in ICE_CANDIDATE payload`);
        throw new BadRequestException('ICE_CANDIDATE must contain a candidate in the payload');
      }
      this.logger.debug(`   ICE candidate preview: ${JSON.stringify(dto.payload.candidate).substring(0, 50)}...`);
    }

    const room = await this.roomModel.findById(dto.roomId);
    if (!room) {
      this.logger.error('❌ [Service] Room not found');
      throw new NotFoundException('Room not found');
    }

    this.logger.log('✅ [Service] Room found');
    this.logger.debug(`   Child ID: ${this.getChildId(room).toString()}`);
    this.logger.debug(`   Parent ID: ${room.parent.toString()}`);
    this.logger.debug(`   Invited Parents: ${room.invitedParents?.map(p => p.toString())}`);

    // ✅ FIX: Use simplified access check for WebRTC signaling
    // Only verify that sender is a participant (child, main parent, or invited parent)
    if (!this.isRoomParticipant(room, dto.senderModel, dto.senderId)) {
      this.logger.error('❌ [Service] Sender is not a participant of this room');
      throw new ForbiddenException('You are not a participant of this room');
    }

    this.logger.log('✅ [Service] Access granted - creating signal message');

    // ✅ Create the signal message
    const msg = await this.messageModel.create({
      room: room._id,
      senderModel: dto.senderModel,
      senderId: new Types.ObjectId(dto.senderId),
      type: MessageType[dto.type],
      signalingPayload: dto.payload,
    });

    this.logger.log(`✅ [Service] Signal ${dto.type} created successfully`);
    this.logger.debug(`   Message ID: ${msg._id}`);
    this.logger.debug(`   Message Type: ${MessageType[dto.type]}`);

    return msg.toObject();
  }

  /**
   * Delete a message from a room
   * Only the sender can delete their own message
   */
  async deleteMessage(messageId: string, currentUser: any): Promise<void> {
    this.logger.log(`🗑️ [deleteMessage] Deleting message: ${messageId}`);
    
    // Find the message
    const message = await this.messageModel.findById(messageId);
    if (!message) {
      this.logger.error(`❌ [deleteMessage] Message not found: ${messageId}`);
      throw new NotFoundException('Message not found');
    }

    // Get the room to verify access
    const room = await this.roomModel.findById(message.room);
    if (!room) {
      this.logger.error(`❌ [deleteMessage] Room not found for message: ${messageId}`);
      throw new NotFoundException('Room not found');
    }

    // Verify user has access to the room
    await this.assertRoomAccess(room, currentUser);

    // Verify user is the sender (only sender can delete their own message)
    const userId = this.getUserId(currentUser);
    const senderObjectId = new Types.ObjectId(message.senderId);
    const userObjectId = new Types.ObjectId(userId);

    // Check if current user is the sender
    const isSender = senderObjectId.equals(userObjectId);
    
    // Also check if senderModel matches
    const isSenderModelMatch = 
      (currentUser.type === 'child' && message.senderModel === 'Child') ||
      (currentUser.type !== 'child' && message.senderModel === 'User');

    if (!isSender || !isSenderModelMatch) {
      this.logger.error(`❌ [deleteMessage] User ${userId} is not the sender of message ${messageId}`);
      throw new ForbiddenException('You can only delete your own messages');
    }

    this.logger.log(`✅ [deleteMessage] User ${userId} is authorized to delete message ${messageId}`);

    // If it's an audio message with Cloudinary public_id, delete from Cloudinary
    if (message.type === MessageType.AUDIO && message.audio?.cloudinaryPublicId) {
      this.logger.log(`🗑️ [deleteMessage] Deleting audio file from Cloudinary: ${message.audio.cloudinaryPublicId}`);
      await this.cloudinaryService.deleteFile(message.audio.cloudinaryPublicId, 'video');
    }

    // Delete the message from database
    await this.messageModel.findByIdAndDelete(messageId);
    
    this.logger.log(`✅ [deleteMessage] Message ${messageId} deleted successfully`);

    // Update room's last message if this was the last message
    const lastMessage = await this.messageModel
      .findOne({ room: message.room })
      .sort({ createdAt: -1 })
      .lean() as any;

    if (lastMessage) {
      await this.roomModel.findByIdAndUpdate(message.room, {
        $set: {
          lastMessage: {
            text: lastMessage.text || '[Audio]',
            senderModel: lastMessage.senderModel,
            senderId: lastMessage.senderId,
            createdAt: lastMessage.createdAt || new Date(),
          },
        },
      });
    } else {
      // No messages left, clear last message
      await this.roomModel.findByIdAndUpdate(message.room, {
        $unset: { lastMessage: 1 },
      });
    }
  }
}