import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { SosAlertService } from './sos-alert.service';

@ApiTags('SOS Alerts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('sos-alert')
export class SosAlertController {
  constructor(private readonly sosAlertService: SosAlertService) {}

  /**
   * Trigger SOS alert (called when child clicks SOS button 3 times)
   * Initiates a Messenger call to parent (like normal chat call)
   * If parent doesn't answer after 2 attempts, opens phone dialer for 196
   */
  @Post('trigger/:childId')
  @ApiOperation({ summary: 'Trigger SOS alert - initiates Messenger call to parent' })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({ 
    status: 201, 
    description: 'SOS alert triggered, Messenger call initiated to parent',
    schema: {
      type: 'object',
      properties: {
        alert: { type: 'object', description: 'SOS alert object' },
        roomId: { type: 'string', description: 'Chat room ID for the call' },
        action: { type: 'string', example: 'CALL_INITIATED' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only children can trigger SOS' })
  async triggerSos(
    @Param('childId') childId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.sosAlertService.triggerSos(childId, currentUser);
  }

  /**
   * Get active SOS alert for a child
   */
  @Get('active/:childId')
  @ApiOperation({ summary: 'Get active SOS alert for a child' })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({ status: 200, description: 'Active SOS alert (or null if none)' })
  async getActiveAlert(
    @Param('childId') childId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.sosAlertService.getActiveAlert(childId, currentUser);
  }

  /**
   * Get SOS alert history for a child
   */
  @Get('history/:childId')
  @ApiOperation({ summary: 'Get SOS alert history for a child' })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({ status: 200, description: 'List of SOS alerts' })
  async getAlertHistory(
    @Param('childId') childId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.sosAlertService.getAlertHistory(childId, currentUser);
  }

  /**
   * Mark parent as answered (when parent responds via Messenger)
   */
  @Post('parent-answered/:alertId')
  @ApiOperation({ summary: 'Mark parent as answered (when parent responds via Messenger call)' })
  @ApiParam({ name: 'alertId', description: 'SOS Alert ID' })
  @ApiResponse({ status: 200, description: 'Parent marked as answered' })
  async markParentAnswered(
    @Param('alertId') alertId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.sosAlertService.markParentAnswered(alertId, currentUser);
  }

  /**
   * Resolve an SOS alert
   */
  @Post('resolve/:alertId')
  @ApiOperation({ summary: 'Resolve/cancel an SOS alert' })
  @ApiParam({ name: 'alertId', description: 'SOS Alert ID' })
  @ApiResponse({ status: 200, description: 'SOS alert resolved' })
  async resolveAlert(
    @Param('alertId') alertId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.sosAlertService.resolveAlert(alertId, currentUser);
  }

}

