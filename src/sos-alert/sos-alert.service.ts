import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SosAlert, SosAlertDocument, SosAlertStatus } from './schemas/sos-alert.schema';
import { Child, ChildDocument } from '../child/schemas/child.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Room, RoomDocument } from '../message/schemas/room.schema';
import { ChatGateway } from '../message/gateway/chat.gateway';

@Injectable()
export class SosAlertService {
  private readonly logger = new Logger(SosAlertService.name);
  private readonly MAX_PARENT_CALL_ATTEMPTS = 2;
  private readonly EMERGENCY_NUMBER = '196'; // Tunisia emergency number

  constructor(
    @InjectModel(SosAlert.name) private sosAlertModel: Model<SosAlertDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    private chatGateway: ChatGateway,
  ) {}

  /**
   * Get user ID from current user object
   */
  private getUserId(user: any): string {
    return user.id || user.sub || user._id?.toString() || user._id;
  }

  /**
   * Trigger SOS alert - called when child clicks SOS button 3 times
   * Initiates a Messenger call to parent (like normal chat call)
   * If parent doesn't answer after 2 attempts, opens phone dialer for 196
   */
  async triggerSos(childId: string, currentUser: any): Promise<{ alert: SosAlertDocument; roomId: string; action: string }> {
    // Verify user is a child and matches the childId
    if (currentUser.type !== 'child') {
      throw new ForbiddenException('Only children can trigger SOS alerts');
    }

    const userId = this.getUserId(currentUser);
    if (userId !== childId) {
      throw new ForbiddenException('You can only trigger SOS for yourself');
    }

    // Get child and parent information
    const child = await this.childModel.findById(childId);
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    // Get parent ID (handle both populated and non-populated)
    const parentId = (child.parent as any)?._id 
      ? (child.parent as any)._id.toString() 
      : child.parent.toString();
    
    const parent = await this.userModel.findById(parentId);
    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    // Get or create room for parent-child pair
    const room = await this.roomModel.findOne({
      parent: new Types.ObjectId(parentId),
      child: new Types.ObjectId(childId),
      isActive: true,
    });

    if (!room) {
      throw new NotFoundException('Chat room not found. Please ensure room exists between parent and child.');
    }

    // Check if there's an active SOS alert for this child
    const activeAlert = await this.sosAlertModel.findOne({
      child: new Types.ObjectId(childId),
      status: { $in: [SosAlertStatus.PENDING, SosAlertStatus.CALLING_PARENT, SosAlertStatus.CALLING_EMERGENCY] },
    });

    if (activeAlert) {
      this.logger.warn(`[SOS] Active alert already exists for child ${childId}, returning existing alert`);
      return {
        alert: activeAlert,
        roomId: room._id.toString(),
        action: 'CALL_INITIATED',
      };
    }

    // Create new SOS alert
    const sosAlert = await this.sosAlertModel.create({
      child: new Types.ObjectId(childId),
      parent: new Types.ObjectId((parent._id as any).toString()),
      status: SosAlertStatus.CALLING_PARENT,
      parentCallAttempts: 1,
      emergencyCallAttempts: 0,
      metadata: {
        roomId: room._id.toString(),
        childLocation: child.location,
        triggeredAt: new Date(),
      },
    });

    this.logger.log(`🚨 [SOS] Alert triggered by child ${childId} for parent ${parent._id}`);

    // Send Messenger call signal to parent (like normal chat call)
    const parentIdStr = parent._id.toString();
    const childName = `${child.firstName} ${child.lastName}`;
    
    // Emit SOS call signal to parent via WebSocket (same as normal call)
    this.chatGateway.server.emit(`room:${room._id.toString()}`, {
      type: 'SOS_CALL_OFFER',
      roomId: room._id.toString(),
      senderModel: 'Child',
      senderId: childId,
      alertId: sosAlert._id.toString(),
      message: `🚨 Emergency SOS call from ${childName}`,
      timestamp: new Date(),
    });

    // Also send direct notification to parent
    this.chatGateway.server.emit(`sos-call:${parentIdStr}`, {
      type: 'SOS_CALL',
      roomId: room._id.toString(),
      alertId: sosAlert._id.toString(),
      childId: childId,
      childName: childName,
      action: 'ANSWER_CALL',
      timestamp: new Date(),
    });

    // Update alert with call information
    await this.sosAlertModel.findByIdAndUpdate(sosAlert._id, {
      $push: {
        callHistory: {
          callSid: `SOS_CALL_${sosAlert._id}`,
          phoneNumber: parent.phoneNumber || 'N/A',
          callType: 'PARENT',
          status: 'initiated',
          answered: false,
          timestamp: new Date(),
        },
      },
    });

    // Set timeout to check if parent answered (30 seconds)
    setTimeout(async () => {
      await this.checkCallStatus(sosAlert._id.toString(), room._id.toString());
    }, 30000); // Wait 30 seconds

    return {
      alert: sosAlert,
      roomId: room._id.toString(),
      action: 'CALL_INITIATED',
    };
  }

  /**
   * Check if parent answered the call, if not retry or escalate to emergency
   */
  private async checkCallStatus(alertId: string, roomId: string): Promise<void> {
    const alert = await this.sosAlertModel.findById(alertId);
    if (!alert) {
      this.logger.error(`[SOS] Alert ${alertId} not found`);
      return;
    }

    // If already resolved or cancelled, skip
    if (alert.status === SosAlertStatus.RESOLVED || alert.status === SosAlertStatus.CANCELLED || alert.status === SosAlertStatus.PARENT_ANSWERED) {
      this.logger.log(`[SOS] Alert ${alertId} is already ${alert.status}, skipping check`);
      return;
    }

    // If parent hasn't answered and we haven't reached max attempts, retry
    if (alert.parentCallAttempts < this.MAX_PARENT_CALL_ATTEMPTS) {
      this.logger.log(`[SOS] Parent didn't answer, retrying call (attempt ${alert.parentCallAttempts + 1})`);
      
      // Retry calling parent
      await this.sosAlertModel.findByIdAndUpdate(alertId, {
        $inc: { parentCallAttempts: 1 },
        $push: {
          callHistory: {
            callSid: `SOS_CALL_RETRY_${alert.parentCallAttempts + 1}`,
            phoneNumber: 'N/A',
            callType: 'PARENT',
            status: 'retry',
            answered: false,
            timestamp: new Date(),
          },
        },
      });

      // Send retry call signal
      const child = await this.childModel.findById(alert.child);
      const parent = await this.userModel.findById(alert.parent);
      const childName = `${child.firstName} ${child.lastName}`;

      this.chatGateway.server.emit(`room:${roomId}`, {
        type: 'SOS_CALL_OFFER',
        roomId: roomId,
        senderModel: 'Child',
        senderId: alert.child.toString(),
        alertId: alertId,
        message: `🚨 Emergency SOS call from ${childName} (Retry ${alert.parentCallAttempts + 1})`,
        timestamp: new Date(),
      });

      // Check again after 30 seconds
      setTimeout(async () => {
        await this.checkCallStatus(alertId, roomId);
      }, 30000);
    } else {
      // Max attempts reached, escalate to emergency
      this.logger.log(`[SOS] Parent didn't answer after ${this.MAX_PARENT_CALL_ATTEMPTS} attempts, escalating to emergency`);
      await this.callEmergency(alertId);
    }
  }

  /**
   * Call emergency number (196) - opens phone dialer on child's device
   */
  private async callEmergency(alertId: string): Promise<void> {
    const alert = await this.sosAlertModel.findById(alertId).populate(['child', 'parent']);
    if (!alert) {
      this.logger.error(`[SOS] Alert ${alertId} not found`);
      return;
    }

    if (alert.status === SosAlertStatus.RESOLVED || alert.status === SosAlertStatus.CANCELLED) {
      this.logger.log(`[SOS] Alert ${alertId} is already ${alert.status}, skipping emergency call`);
      return;
    }

    // Update status to calling emergency
    await this.sosAlertModel.findByIdAndUpdate(alertId, {
      status: SosAlertStatus.CALLING_EMERGENCY,
      $inc: { emergencyCallAttempts: 1 },
    });

    const child = alert.child as any;
    const childId = child._id.toString();

    this.logger.log(`🚨 [SOS] Opening phone dialer for emergency number 196 for alert ${alertId}`);

    // Send WebSocket notification to child's app to open phone dialer
    this.chatGateway.server.emit(`sos-emergency:${childId}`, {
      type: 'SOS_EMERGENCY',
      alertId: alertId,
      action: 'OPEN_PHONE_DIALER',
      phoneNumber: this.EMERGENCY_NUMBER, // '196' - Tunisia emergency number
      message: `🚨 Emergency: Parent didn't answer. Opening phone dialer to call ${this.EMERGENCY_NUMBER}`,
      timestamp: new Date(),
    });

    // Update alert
    await this.sosAlertModel.findByIdAndUpdate(alertId, {
      status: SosAlertStatus.EMERGENCY_CALLED,
      $push: {
        callHistory: {
          callSid: 'PHONE_DIALER_196',
          phoneNumber: this.EMERGENCY_NUMBER,
          callType: 'EMERGENCY',
          status: 'dialer_opened',
          answered: false,
          timestamp: new Date(),
        },
      },
    });

    this.logger.log(`✅ [SOS] Emergency dialer request sent for alert ${alertId}`);
  }

  /**
   * Mark parent as answered (called when parent answers the Messenger call)
   */
  async markParentAnswered(alertId: string, currentUser: any): Promise<SosAlertDocument> {
    const alert = await this.sosAlertModel.findById(alertId).populate('parent');
    if (!alert) {
      throw new NotFoundException('SOS alert not found');
    }

    const userId = this.getUserId(currentUser);
    const parent = alert.parent as any;
    const parentId = parent._id.toString();

    // Verify user is the parent
    if (userId !== parentId) {
      throw new ForbiddenException('Only the parent can mark themselves as answered');
    }

    // Update alert status - parent answered, so no need for emergency call
    await this.sosAlertModel.findByIdAndUpdate(alertId, {
      status: SosAlertStatus.PARENT_ANSWERED,
      resolvedAt: new Date(),
      resolvedBy: parentId,
      $set: {
        'callHistory.$[elem].answered': true,
        'callHistory.$[elem].status': 'answered',
      },
    }, {
      arrayFilters: [{ 'elem.callType': 'PARENT', 'elem.answered': false }],
    });

    this.logger.log(`✅ [SOS] Parent answered alert ${alertId}, alert resolved`);

    // Notify child that parent answered
    const child = await this.childModel.findById(alert.child);
    if (child) {
      this.chatGateway.server.emit(`sos-resolved:${alert.child.toString()}`, {
        type: 'SOS_RESOLVED',
        alertId: alertId,
        message: 'Parent answered the call',
        timestamp: new Date(),
      });
    }

    return this.sosAlertModel.findById(alertId).populate('parent').populate('child');
  }

  /**
   * Handle call status callback (legacy - for compatibility)
   */
  async handleCallStatus(alertId: string, callType: 'PARENT' | 'EMERGENCY', callStatus: string, callSid: string, answered: boolean = false): Promise<void> {
    // This method is kept for backward compatibility but is not used for Messenger calls
    // Messenger call status is handled via markParentAnswered
    this.logger.debug(`[SOS] Call status update received for alert ${alertId}, type: ${callType}, status: ${callStatus}`);
  }

  /**
   * Get active SOS alert for a child
   */
  async getActiveAlert(childId: string, currentUser: any): Promise<SosAlertDocument | null> {
    const userId = this.getUserId(currentUser);
    
    // Verify access
    if (currentUser.type === 'child' && userId !== childId) {
      throw new ForbiddenException('You can only view your own SOS alerts');
    }

    const child = await this.childModel.findById(childId);
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    // Parents can only see alerts for their children
    if (currentUser.type !== 'child' && currentUser.role !== 'ADMIN') {
      const childParentId = child.parent.toString();
      if (userId !== childParentId && !child.linkedParents.some((p: any) => p.toString() === userId)) {
        throw new ForbiddenException('You can only view SOS alerts for your children');
      }
    }

    return this.sosAlertModel
      .findOne({
        child: new Types.ObjectId(childId),
        status: { $in: [SosAlertStatus.PENDING, SosAlertStatus.CALLING_PARENT, SosAlertStatus.CALLING_EMERGENCY] },
      })
      .populate('parent', 'firstName lastName phoneNumber')
      .populate('child', 'firstName lastName')
      .sort({ createdAt: -1 });
  }

  /**
   * Get all SOS alerts for a child
   */
  async getAlertHistory(childId: string, currentUser: any): Promise<SosAlertDocument[]> {
    const userId = this.getUserId(currentUser);
    
    // Verify access (same logic as getActiveAlert)
    if (currentUser.type === 'child' && userId !== childId) {
      throw new ForbiddenException('You can only view your own SOS alerts');
    }

    const child = await this.childModel.findById(childId);
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    if (currentUser.type !== 'child' && currentUser.role !== 'ADMIN') {
      const childParentId = child.parent.toString();
      if (userId !== childParentId && !child.linkedParents.some((p: any) => p.toString() === userId)) {
        throw new ForbiddenException('You can only view SOS alerts for your children');
      }
    }

    return this.sosAlertModel
      .find({ child: new Types.ObjectId(childId) })
      .populate('parent', 'firstName lastName phoneNumber')
      .populate('child', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50);
  }

  /**
   * Resolve/cancel an SOS alert
   */
  async resolveAlert(alertId: string, currentUser: any): Promise<SosAlertDocument> {
    const alert = await this.sosAlertModel.findById(alertId).populate('child');
    if (!alert) {
      throw new NotFoundException('SOS alert not found');
    }

    const userId = this.getUserId(currentUser);
    const child = alert.child as any;

    // Verify access
    if (currentUser.type === 'child') {
      if (child._id.toString() !== userId) {
        throw new ForbiddenException('You can only resolve your own SOS alerts');
      }
    } else if (currentUser.role !== 'ADMIN') {
      const childParentId = child.parent.toString();
      if (userId !== childParentId && !child.linkedParents.some((p: any) => p.toString() === userId)) {
        throw new ForbiddenException('You can only resolve SOS alerts for your children');
      }
    }

    await this.sosAlertModel.findByIdAndUpdate(alertId, {
      status: SosAlertStatus.RESOLVED,
      resolvedAt: new Date(),
      resolvedBy: userId,
    });

    this.logger.log(`✅ [SOS] Alert ${alertId} resolved by ${userId}`);

    return this.sosAlertModel.findById(alertId).populate('parent').populate('child');
  }
}

