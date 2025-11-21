import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Child, ChildDocument } from './schemas/child.schema';
import { User, UserRole } from '../user/schemas/user.schema';
import { Room, RoomDocument } from '../message/schemas/room.schema';
import { Message, MessageDocument } from '../message/schemas/message.schema';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';
import { UpdateChildLocationDto } from './dto/update-child-location.dto';

@Injectable()
export class ChildService {
  constructor(
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(User.name) private userModel: Model<any>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async create(createChildDto: CreateChildDto, currentUser: any): Promise<Child> {
    // If current user is a PARENT, they can only create children for themselves
    // If current user is ADMIN, they can create children for any user
    let parentId = currentUser.id;
    
    if (currentUser.role === UserRole.ADMIN) {
      // ADMIN can specify parent in the DTO
      if (createChildDto.parent) {
        parentId = createChildDto.parent;
      }
    } else if (currentUser.type === 'child') {
      throw new ForbiddenException('Children cannot create other children');
    } else if (currentUser.role !== UserRole.PARENT) {
      throw new ForbiddenException('Only PARENT or ADMIN can create children');
    }

    // Verify parent exists
    const parent = await this.userModel.findById(parentId);
    if (!parent) {
      throw new NotFoundException('Parent user not found');
    }

    // Verify parent is actually a PARENT role
    if (parent.role !== UserRole.PARENT) {
      throw new ForbiddenException('Children can only be assigned to users with PARENT role');
    }

    const { parent: parentFromDto, ...childData } = createChildDto;
    
    // Generate unique QR code for child login if not provided
    let qrCode = createChildDto.qrCode;
    if (!qrCode) {
      // Generate a secure random QR code (32 characters)
      qrCode = crypto.randomBytes(16).toString('hex');
    }
    
    const child = new this.childModel({
      ...childData,
      parent: parentId,
      qrCode,
    });

    const savedChild = await child.save();
    
    // Auto-create room for parent-child pair
    try {
      await this.roomModel.create({
        parent: new Types.ObjectId(parentId),
        child: savedChild._id,
        isActive: true,
      });
    } catch (error: any) {
      // Ignore if room already exists (unique constraint)
      if (error.code !== 11000) {
        console.error('Error creating room for child:', error.message);
      }
    }
    
    // Return child with QR code included (for parent to use for child login)
    return savedChild;
  }

  async findAll(currentUser: any): Promise<Child[]> {
    // ADMIN can see all children, PARENT can only see their own children
    if (currentUser.role === UserRole.ADMIN) {
      return this.childModel.find().populate('parent', '-password').populate('linkedParents', '-password').exec();
    } else if (currentUser.type === 'child') {
      // Children can only see themselves
      return this.childModel.find({ _id: currentUser.id }).populate('parent', '-password').populate('linkedParents', '-password').exec();
    } else {
      // PARENT sees children where they are the parent OR in linkedParents
      return this.childModel.find({
        $or: [
          { parent: currentUser.id },
          { linkedParents: currentUser.id }
        ]
      }).populate('parent', '-password').populate('linkedParents', '-password').exec();
    }
  }

  async findOne(id: string, currentUser: any): Promise<Child> {
    const child = await this.childModel.findById(id).populate('parent', '-password').populate('linkedParents', '-password').exec();
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    // ADMIN can see any child, PARENT can only see their own children
    if (currentUser.role === UserRole.ADMIN) {
      return child;
    } else if (currentUser.type === 'child') {
      // Children can only see themselves
      if (currentUser.id !== id) {
        throw new ForbiddenException('You can only access your own profile');
      }
      return child;
    } else {
      // PARENT can only see children where they are parent or linkedParent
      const isParent = child.parent.toString() === currentUser.id;
      const isLinkedParent = child.linkedParents.some(p => p.toString() === currentUser.id);
      
      if (!isParent && !isLinkedParent) {
        throw new ForbiddenException('You can only access your own children');
      }
      return child;
    }
  }

  async update(id: string, updateChildDto: UpdateChildDto, currentUser: any): Promise<Child> {
    const child = await this.childModel.findById(id);
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    // ADMIN can update any child, PARENT can only update their own children
    if (currentUser.role !== UserRole.ADMIN) {
      if (currentUser.type === 'child') {
        // Children can only update themselves
        if (currentUser.id !== id) {
          throw new ForbiddenException('You can only update your own profile');
        }
      } else {
        // PARENT can only update children where they are parent or linkedParent
        const isParent = child.parent.toString() === currentUser.id;
        const isLinkedParent = child.linkedParents.some(p => p.toString() === currentUser.id);
        
        if (!isParent && !isLinkedParent) {
          throw new ForbiddenException('You can only update your own children');
        }
      }
    }

    // Use findByIdAndUpdate for partial updates
    const updatedChild = await this.childModel.findByIdAndUpdate(
      id,
      { $set: updateChildDto },
      { new: true, runValidators: true }
    ).populate('parent', '-password').populate('linkedParents', '-password').exec();

    if (!updatedChild) {
      throw new NotFoundException('Child not found after update');
    }

    return updatedChild;
  }

  async remove(id: string, currentUser: any): Promise<void> {
    const child = await this.childModel.findById(id);
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    // Only ADMIN can delete children, or PARENT can delete their own children
    if (currentUser.role === UserRole.ADMIN) {
      // ADMIN can delete any child
    } else if (currentUser.type === 'child') {
      throw new ForbiddenException('Children cannot delete accounts');
    } else {
      // PARENT can only delete children where they are the main parent
      if (child.parent.toString() !== currentUser.id) {
        throw new ForbiddenException('You can only delete your own children');
      }
    }

    const childObjectId = new Types.ObjectId(id);

    // Find all rooms associated with this child
    const rooms = await this.roomModel.find({ child: childObjectId });
    const roomIds = rooms.map(room => room._id);

    // Delete all messages in those rooms
    if (roomIds.length > 0) {
      await this.messageModel.deleteMany({ room: { $in: roomIds } });
    }

    // Delete all rooms associated with this child
    await this.roomModel.deleteMany({ child: childObjectId });

    // Finally, delete the child
    await this.childModel.findByIdAndDelete(id);
  }

  async getProfile(currentUser: any): Promise<Child> {
    if (currentUser.type !== 'child') {
      throw new ForbiddenException('This endpoint is only for children');
    }

    const child = await this.childModel.findById(currentUser.id).populate('parent', '-password').populate('linkedParents', '-password').exec();
    if (!child) {
      throw new NotFoundException('Child not found');
    }
    return child;
  }

  async getChildrenByParent(parentId: string, currentUser: any): Promise<Child[]> {
    // ADMIN can see children of any parent
    // PARENT can only see their own children
    if (currentUser.role !== UserRole.ADMIN && currentUser.id !== parentId) {
      throw new ForbiddenException('You can only view your own children');
    }

    return this.childModel.find({
      $or: [
        { parent: parentId },
        { linkedParents: parentId }
      ]
    }).populate('parent', '-password').populate('linkedParents', '-password').exec();
  }

  async updateLocation(id: string, updateChildLocationDto: UpdateChildLocationDto, currentUser: any): Promise<Child> {
    const child = await this.childModel.findById(id);
    if (!child) {
      throw new NotFoundException('Child not found');
    }

    if (currentUser.role !== UserRole.ADMIN) {
      if (currentUser.type === 'child') {
        if (currentUser.id !== id) {
          throw new ForbiddenException('You can only update your own location');
        }
      } else {
        const isParent = child.parent.toString() === currentUser.id;
        const isLinkedParent = child.linkedParents.some(p => p.toString() === currentUser.id);

        if (!isParent && !isLinkedParent) {
          throw new ForbiddenException('You can only update your own children');
        }
      }
    }

    child.location = {
      lat: updateChildLocationDto.lat,
      lng: updateChildLocationDto.lng,
      updatedAt: new Date(),
    } as any;

    await child.save({ validateModifiedOnly: true });

    const updatedChild = await this.childModel.findById(id).populate('parent', '-password').populate('linkedParents', '-password').exec();
    if (!updatedChild) {
      throw new NotFoundException('Child not found after updating location');
    }
    return updatedChild;
  }
}
