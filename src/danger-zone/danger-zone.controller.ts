import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { DangerZoneService } from './danger-zone.service';
import { CreateDangerZoneDto } from './dto/create-danger-zone.dto';
import { UpdateDangerZoneDto } from './dto/update-danger-zone.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { UserRole } from '../user/schemas/user.schema';

@ApiTags('Danger Zones')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('danger-zones')
export class DangerZoneController {
  constructor(private readonly dangerZoneService: DangerZoneService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ 
    summary: 'Create a new danger zone (PARENT and ADMIN only)',
    description: 'Parents create zones for their children. When a child enters/exits, notifications are sent.'
  })
  @ApiResponse({ status: 201, description: 'Danger zone successfully created' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only PARENT or ADMIN can create danger zones' })
  create(@Body() createDangerZoneDto: CreateDangerZoneDto, @CurrentUser() currentUser: any) {
    return this.dangerZoneService.create(createDangerZoneDto, currentUser);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ 
    summary: 'Get all danger zones (ADMIN sees all, PARENT sees only their own)',
  })
  @ApiResponse({ status: 200, description: 'List of danger zones' })
  findAll(@CurrentUser() currentUser: any) {
    return this.dangerZoneService.findAll(currentUser);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ 
    summary: 'Get danger zone by ID (ADMIN can access any, PARENT only their own)',
  })
  @ApiParam({ name: 'id', description: 'Danger Zone ID' })
  @ApiResponse({ status: 200, description: 'Danger zone details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot access this danger zone' })
  @ApiResponse({ status: 404, description: 'Danger zone not found' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.dangerZoneService.findOne(id, currentUser);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ 
    summary: 'Update danger zone (ADMIN can update any, PARENT only their own)',
  })
  @ApiParam({ name: 'id', description: 'Danger Zone ID' })
  @ApiResponse({ status: 200, description: 'Danger zone successfully updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot update this danger zone' })
  @ApiResponse({ status: 404, description: 'Danger zone not found' })
  update(
    @Param('id') id: string,
    @Body() updateDangerZoneDto: UpdateDangerZoneDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.dangerZoneService.update(id, updateDangerZoneDto, currentUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ 
    summary: 'Delete danger zone (ADMIN can delete any, PARENT only their own)',
  })
  @ApiParam({ name: 'id', description: 'Danger Zone ID' })
  @ApiResponse({ status: 200, description: 'Danger zone successfully deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot delete this danger zone' })
  @ApiResponse({ status: 404, description: 'Danger zone not found' })
  remove(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.dangerZoneService.remove(id, currentUser);
  }

  @Get(':id/events')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ 
    summary: 'Get all events (entry/exit) for a danger zone',
    description: 'Returns history of children entering/exiting this zone'
  })
  @ApiParam({ name: 'id', description: 'Danger Zone ID' })
  @ApiResponse({ status: 200, description: 'List of danger zone events' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Danger zone not found' })
  getZoneEvents(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.dangerZoneService.getZoneEvents(id, currentUser);
  }

  @Get('child/:childId/active')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ 
    summary: 'Get all active danger zones for a specific child',
    description: 'Shows which danger zones are currently monitoring this child'
  })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({ status: 200, description: 'List of active danger zones for the child' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Child not found' })
  getChildActiveZones(@Param('childId') childId: string, @CurrentUser() currentUser: any) {
    return this.dangerZoneService.getChildActiveZones(childId, currentUser);
  }
}

