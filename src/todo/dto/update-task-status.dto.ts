import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTaskStatusDto {
  @ApiProperty({ description: 'Statut de la tâche (true = complétée, false = incomplétée)', example: true })
  @IsBoolean()
  @IsNotEmpty()
  isCompleted: boolean;
}

