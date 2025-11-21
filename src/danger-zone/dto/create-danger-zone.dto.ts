import { IsString, IsNotEmpty, IsNumber, Min, Max, IsOptional, IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Types } from 'mongoose';

class CoordinatesDto {
  @ApiProperty({ example: 33.5731, description: 'Latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: -7.6598, description: 'Longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class CreateDangerZoneDto {
  @ApiProperty({ example: 'School Area', description: 'Name of the danger zone' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Alert when child is near school during non-school hours', description: 'Description of the danger zone' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: CoordinatesDto, description: 'Center coordinates of the danger zone' })
  @ValidateNested()
  @Type(() => CoordinatesDto)
  center: CoordinatesDto;

  @ApiProperty({ example: 500, description: 'Radius in meters (10m to 50km)', minimum: 10, maximum: 50000 })
  @IsNumber()
  @Min(10)
  @Max(50000)
  radiusMeters: number;

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'Child IDs to monitor (empty array = all children)', 
    example: [] 
  })
  @IsArray()
  @IsOptional()
  children?: string[];

  @ApiPropertyOptional({ example: true, description: 'Send notification when child enters zone' })
  @IsBoolean()
  @IsOptional()
  notifyOnEntry?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Send notification when child exits zone' })
  @IsBoolean()
  @IsOptional()
  notifyOnExit?: boolean;
}

