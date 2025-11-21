import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTaskDto } from './create-todo.dto';

export class UpdateTodoDto {
  @ApiPropertyOptional({ description: 'Titre de la todolist', example: 'Tâches du mardi' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Description de la todolist', example: 'Liste des tâches à faire ce mardi' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Liste complète des tâches (remplace les tâches existantes)', 
    type: [CreateTaskDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  @IsOptional()
  tasks?: CreateTaskDto[];
}

