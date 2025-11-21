import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DangerZone, DangerZoneDocument, DangerZoneStatus } from './schemas/danger-zone.schema';
import { DangerZoneEvent, DangerZoneEventDocument, DangerZoneEventType } from './schemas/danger-zone-event.schema';
import { Child, ChildDocument } from '../child/schemas/child.schema';
import { CreateDangerZoneDto } from './dto/create-danger-zone.dto';
import { UpdateDangerZoneDto } from './dto/update-danger-zone.dto';
import { UserRole } from '../user/schemas/user.schema';

@Injectable()
export class DangerZoneService {
  constructor(
    @InjectModel(DangerZone.name) private dangerZoneModel: Model<DangerZoneDocument>,
    @InjectModel(DangerZoneEvent.name) private dangerZoneEventModel: Model<DangerZoneEventDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
  ) {}

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  async create(createDangerZoneDto: CreateDangerZoneDto, currentUser: any): Promise<DangerZone> {
    // Parent can only create zones for themselves
    let parentId = currentUser.id;

    if (currentUser.role === UserRole.ADMIN && createDangerZoneDto['parent']) {
      // Admin can specify parent
      parentId = createDangerZoneDto['parent'];
    }

    // Validate children belong to this parent
    if (createDangerZoneDto.children && createDangerZoneDto.children.length > 0) {
      const children = await this.childModel.find({
        _id: { $in: createDangerZoneDto.children.map(id => new Types.ObjectId(id)) },
      });

      for (const child of children) {
        const isParent = child.parent.toString() === parentId;
        const isLinkedParent = child.linkedParents.some(p => p.toString() === parentId);
        
        if (!isParent && !isLinkedParent && currentUser.role !== UserRole.ADMIN) {
          throw new ForbiddenException(`Child ${child._id} does not belong to you`);
        }
      }
    }

    const dangerZone = new this.dangerZoneModel({
      ...createDangerZoneDto,
      parent: parentId,
      children: createDangerZoneDto.children?.map(id => new Types.ObjectId(id)) || [],
    });

    return dangerZone.save();
  }

  async findAll(currentUser: any): Promise<DangerZone[]> {
    // Admin can see all danger zones, parent sees only their own
    const query = currentUser.role === UserRole.ADMIN 
      ? {} 
      : { parent: currentUser.id };

    return this.dangerZoneModel
      .find(query)
      .populate('parent', '-password')
      .populate('children')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, currentUser: any): Promise<DangerZone> {
    const dangerZone = await this.dangerZoneModel
      .findById(id)
      .populate('parent', '-password')
      .populate('children')
      .exec();

    if (!dangerZone) {
      throw new NotFoundException('Danger zone not found');
    }

    // Check ownership
    if (currentUser.role !== UserRole.ADMIN && dangerZone.parent.toString() !== currentUser.id) {
      throw new ForbiddenException('You can only access your own danger zones');
    }

    return dangerZone;
  }

  async update(id: string, updateDangerZoneDto: UpdateDangerZoneDto, currentUser: any): Promise<DangerZone> {
    const dangerZone = await this.dangerZoneModel.findById(id);

    if (!dangerZone) {
      throw new NotFoundException('Danger zone not found');
    }

    // Check ownership
    if (currentUser.role !== UserRole.ADMIN && dangerZone.parent.toString() !== currentUser.id) {
      throw new ForbiddenException('You can only update your own danger zones');
    }

    // Validate children if being updated
    if (updateDangerZoneDto.children && updateDangerZoneDto.children.length > 0) {
      const children = await this.childModel.find({
        _id: { $in: updateDangerZoneDto.children.map(id => new Types.ObjectId(id)) },
      });

      for (const child of children) {
        const isParent = child.parent.toString() === dangerZone.parent.toString();
        const isLinkedParent = child.linkedParents.some(p => p.toString() === dangerZone.parent.toString());
        
        if (!isParent && !isLinkedParent && currentUser.role !== UserRole.ADMIN) {
          throw new ForbiddenException(`Child ${child._id} does not belong to you`);
        }
      }
    }

    const updateData: any = { ...updateDangerZoneDto };
    if (updateDangerZoneDto.children) {
      updateData.children = updateDangerZoneDto.children.map(id => new Types.ObjectId(id));
    }

    const updatedZone = await this.dangerZoneModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .populate('parent', '-password')
      .populate('children')
      .exec();

    if (!updatedZone) {
      throw new NotFoundException('Danger zone not found after update');
    }

    return updatedZone;
  }

  async remove(id: string, currentUser: any): Promise<void> {
    const dangerZone = await this.dangerZoneModel.findById(id);

    if (!dangerZone) {
      throw new NotFoundException('Danger zone not found');
    }

    // Check ownership
    if (currentUser.role !== UserRole.ADMIN && dangerZone.parent.toString() !== currentUser.id) {
      throw new ForbiddenException('You can only delete your own danger zones');
    }

    await this.dangerZoneModel.findByIdAndDelete(id);
    
    // Clean up related events
    await this.dangerZoneEventModel.deleteMany({ dangerZone: id });
  }

  /**
   * Check if a child has entered or exited any danger zones
   * Returns array of events that need notification
   */
  async checkDangerZones(child: Child): Promise<DangerZoneEvent[]> {
    if (!child.location) {
      return [];
    }

    // Get all active danger zones for this child's parent(s)
    const parentIds = [child.parent, ...child.linkedParents];
    const dangerZones = await this.dangerZoneModel.find({
      parent: { $in: parentIds },
      status: DangerZoneStatus.ACTIVE,
      $or: [
        { children: { $size: 0 } }, // Applies to all children
        { children: (child as any)._id }, // Specifically includes this child
      ],
    }).exec();

    const events: DangerZoneEvent[] = [];

    for (const zone of dangerZones) {
      const distance = this.calculateDistance(
        child.location.lat,
        child.location.lng,
        zone.center.lat,
        zone.center.lng,
      );

      const isInsideZone = distance <= zone.radiusMeters;

      // Get last event for this child-zone pair
      const lastEvent = await this.dangerZoneEventModel
        .findOne({ child: (child as any)._id, dangerZone: zone._id })
        .sort({ createdAt: -1 })
        .exec();

      const wasInsideZone = lastEvent?.type === DangerZoneEventType.ENTER;

      // Detect state change
      if (isInsideZone && !wasInsideZone) {
        // Child entered zone
        if (zone.notifyOnEntry) {
          const event = await this.dangerZoneEventModel.create({
            child: (child as any)._id,
            dangerZone: zone._id,
            type: DangerZoneEventType.ENTER,
            location: child.location,
            notificationSent: false,
          });
          events.push(event);
        }
      } else if (!isInsideZone && wasInsideZone) {
        // Child exited zone
        if (zone.notifyOnExit) {
          const event = await this.dangerZoneEventModel.create({
            child: (child as any)._id,
            dangerZone: zone._id,
            type: DangerZoneEventType.EXIT,
            location: child.location,
            notificationSent: false,
          });
          events.push(event);
        }
      }
    }

    return events;
  }

  /**
   * Get all events for a danger zone
   */
  async getZoneEvents(zoneId: string, currentUser: any): Promise<DangerZoneEvent[]> {
    const dangerZone = await this.dangerZoneModel.findById(zoneId);

    if (!dangerZone) {
      throw new NotFoundException('Danger zone not found');
    }

    // Check ownership
    if (currentUser.role !== UserRole.ADMIN && dangerZone.parent.toString() !== currentUser.id) {
      throw new ForbiddenException('You can only access events for your own danger zones');
    }

    return this.dangerZoneEventModel
      .find({ dangerZone: zoneId })
      .populate('child')
      .populate('dangerZone')
      .sort({ createdAt: -1 })
      .limit(100) // Limit to last 100 events
      .exec();
  }

  /**
   * Mark event notification as sent
   */
  async markNotificationSent(eventId: string): Promise<void> {
    await this.dangerZoneEventModel.findByIdAndUpdate(eventId, { notificationSent: true });
  }

  /**
   * Get active zones for a specific child
   */
  async getChildActiveZones(childId: string, currentUser: any): Promise<DangerZone[]> {
    const child = await this.childModel.findById(childId);
    
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    // Check access
    const isParent = child.parent.toString() === currentUser.id;
    const isLinkedParent = child.linkedParents.some(p => p.toString() === currentUser.id);
    
    if (currentUser.role !== UserRole.ADMIN && !isParent && !isLinkedParent) {
      throw new ForbiddenException('You can only access your own children');
    }

    const parentIds = [child.parent, ...child.linkedParents];
    
    return this.dangerZoneModel.find({
      parent: { $in: parentIds },
      status: DangerZoneStatus.ACTIVE,
      $or: [
        { children: { $size: 0 } },
        { children: (child as any)._id },
      ],
    }).populate('parent', '-password').exec();
  }
}

