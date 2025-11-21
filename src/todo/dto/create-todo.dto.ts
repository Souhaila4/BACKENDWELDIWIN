import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Titre de la tâche', example: 'Faire mes devoirs' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Description de la tâche', example: 'Terminer les exercices de mathématiques' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateTodoDto {
  @ApiProperty({ description: 'Titre de la todolist', example: 'Tâches du lundi' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Description de la todolist', example: 'Liste des tâches à faire ce lundi' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'ID de l\'enfant pour qui la todolist est créée', example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  @IsNotEmpty()
  childId: string;

  @ApiPropertyOptional({ 
    description: 'Liste des tâches initiales', 
    type: [CreateTaskDto],
    example: [
      { title: 'Faire mes devoirs', description: 'Terminer les exercices de mathématiques' },
      { title: 'Ranger ma chambre' }
    ]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  @IsOptional()
  tasks?: CreateTaskDto[];
}

