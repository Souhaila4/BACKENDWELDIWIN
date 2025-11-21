import { PartialType } from '@nestjs/swagger';
import { CreateDangerZoneDto } from './create-danger-zone.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DangerZoneStatus } from '../schemas/danger-zone.schema';

export class UpdateDangerZoneDto extends PartialType(CreateDangerZoneDto) {
  @ApiPropertyOptional({ 
    enum: DangerZoneStatus, 
    example: DangerZoneStatus.ACTIVE,
    description: 'Status of the danger zone' 
  })
  @IsEnum(DangerZoneStatus)
  @IsOptional()
  status?: DangerZoneStatus;
}

