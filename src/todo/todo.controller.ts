import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TodoService } from './todo.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { UserRole } from '../user/schemas/user.schema';

@ApiTags('TodoList')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('todo')
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ summary: 'Créer une todolist pour un enfant (PARENT uniquement)' })
  @ApiResponse({ status: 201, description: 'Todolist créée avec succès' })
  @ApiResponse({ status: 403, description: 'Forbidden - Seuls les parents peuvent créer des todolists' })
  @ApiResponse({ status: 404, description: 'Enfant non trouvé' })
  create(@Body() createTodoDto: CreateTodoDto, @CurrentUser() currentUser: any) {
    return this.todoService.create(createTodoDto, currentUser);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Récupérer toutes les todolists',
    description: 'PARENT : voit les todolists de ses enfants | ENFANT : voit uniquement ses propres todolists'
  })
  @ApiResponse({ status: 200, description: 'Liste des todolists' })
  findAll(@CurrentUser() currentUser: any) {
    return this.todoService.findAll(currentUser);
  }

  @Get('mine')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({
    summary: 'Récupérer toutes les todolists créées par le parent connecté',
    description: 'Retourne uniquement les todolists créées par le parent identifié via le token',
  })
  @ApiResponse({ status: 200, description: 'Liste des todolists créées par le parent' })
  findAllCreatedByParent(@CurrentUser() currentUser: any) {
    return this.todoService.findAllCreatedByParent(currentUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une todolist par ID' })
  @ApiParam({ name: 'id', description: 'ID de la todolist' })
  @ApiResponse({ status: 200, description: 'Détails de la todolist' })
  @ApiResponse({ status: 403, description: 'Forbidden - Pas d\'accès à cette todolist' })
  @ApiResponse({ status: 404, description: 'Todolist non trouvée' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.todoService.findOne(id, currentUser);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ summary: 'Modifier une todolist (PARENT uniquement)' })
  @ApiParam({ name: 'id', description: 'ID de la todolist' })
  @ApiResponse({ status: 200, description: 'Todolist modifiée avec succès' })
  @ApiResponse({ status: 403, description: 'Forbidden - Pas le droit de modifier cette todolist' })
  @ApiResponse({ status: 404, description: 'Todolist non trouvée' })
  update(
    @Param('id') id: string,
    @Body() updateTodoDto: UpdateTodoDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.todoService.update(id, updateTodoDto, currentUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  @ApiOperation({ summary: 'Supprimer une todolist (PARENT uniquement)' })
  @ApiParam({ name: 'id', description: 'ID de la todolist' })
  @ApiResponse({ status: 200, description: 'Todolist supprimée avec succès' })
  @ApiResponse({ status: 403, description: 'Forbidden - Pas le droit de supprimer cette todolist' })
  @ApiResponse({ status: 404, description: 'Todolist non trouvée' })
  remove(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.todoService.remove(id, currentUser);
  }

  @Patch(':id/tasks/:taskIndex/status')
  @ApiOperation({ summary: 'Marquer une tâche comme complétée/incomplétée (ENFANT uniquement)' })
  @ApiParam({ name: 'id', description: 'ID de la todolist' })
  @ApiParam({ name: 'taskIndex', description: 'Index de la tâche (commence à 0)' })
  @ApiResponse({ status: 200, description: 'Statut de la tâche mis à jour' })
  @ApiResponse({ status: 400, description: 'Index de tâche invalide' })
  @ApiResponse({ status: 403, description: 'Forbidden - Seuls les enfants peuvent modifier le statut des tâches' })
  @ApiResponse({ status: 404, description: 'Todolist non trouvée' })
  updateTaskStatus(
    @Param('id') id: string,
    @Param('taskIndex', ParseIntPipe) taskIndex: number,
    @Body() updateTaskStatusDto: UpdateTaskStatusDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.todoService.updateTaskStatus(id, taskIndex, updateTaskStatusDto, currentUser);
  }
}

