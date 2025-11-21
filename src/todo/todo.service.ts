import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Todo, TodoDocument } from './schemas/todo.schema';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { Child } from '../child/schemas/child.schema';

@Injectable()
export class TodoService {
  constructor(
    @InjectModel(Todo.name) private todoModel: Model<TodoDocument>,
    @InjectModel(Child.name) private childModel: Model<Child>,
  ) {}

  /**
   * Créer une todolist pour un enfant (PARENT uniquement)
   */
  async create(createTodoDto: CreateTodoDto, currentUser: any): Promise<TodoDocument> {
    // Vérifier que l'utilisateur est un parent
    if (currentUser.type !== 'user') {
      throw new ForbiddenException('Seuls les parents peuvent créer des todolists');
    }

    // Vérifier que l'enfant existe
    const child = await this.childModel.findById(createTodoDto.childId);
    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    // Vérifier que le parent a le droit de créer une todolist pour cet enfant
    const parentId = new Types.ObjectId(currentUser.id);
    const childParentId = new Types.ObjectId(child.parent);
    const childLinkedParents = child.linkedParents.map(p => new Types.ObjectId(p));

    const isAdmin = currentUser.role === 'ADMIN';
    const isParent = childParentId.equals(parentId) || childLinkedParents.some(p => p.equals(parentId));

    if (!isAdmin && !isParent) {
      throw new ForbiddenException('Vous n\'avez pas le droit de créer une todolist pour cet enfant');
    }

    // Créer la todolist
    const tasks = createTodoDto.tasks?.map(task => ({
      title: task.title,
      description: task.description || '',
      isCompleted: false,
      completedAt: null,
    })) || [];

    const todo = new this.todoModel({
      title: createTodoDto.title,
      description: createTodoDto.description || '',
      child: new Types.ObjectId(createTodoDto.childId),
      createdBy: parentId,
      tasks,
    });

    return todo.save();
  }

  /**
   * Récupérer toutes les todolists (pour PARENT : leurs enfants uniquement)
   */
  async findAll(currentUser: any): Promise<TodoDocument[]> {
    if (currentUser.type === 'user') {
      // Pour les parents et admin : récupérer les todolists de leurs enfants
      if (currentUser.role === 'ADMIN') {
        return this.todoModel.find().populate('child', 'firstName lastName').populate('createdBy', 'firstName lastName').exec();
      }

      // Pour les parents : récupérer uniquement les todolists de leurs enfants
      const parentId = new Types.ObjectId(currentUser.id);
      const children = await this.childModel.find({
        $or: [
          { parent: parentId },
          { linkedParents: parentId },
        ],
      }).select('_id');

      const childIds = children.map(child => child._id);
      return this.todoModel.find({ child: { $in: childIds } })
        .populate('child', 'firstName lastName')
        .populate('createdBy', 'firstName lastName')
        .exec();
    }

    // Pour les enfants : récupérer uniquement leurs propres todolists
    const childId = new Types.ObjectId(currentUser.id);
    return this.todoModel.find({ child: childId })
      .populate('createdBy', 'firstName lastName')
      .exec();
  }

  /**
   * Récupérer toutes les todolists créées par le parent connecté
   */
  async findAllCreatedByParent(currentUser: any): Promise<TodoDocument[]> {
    if (currentUser.type !== 'user') {
      throw new ForbiddenException('Seuls les parents peuvent accéder à leurs propres todolists');
    }

    const parentId = new Types.ObjectId(currentUser.id);

    return this.todoModel
      .find({ createdBy: parentId })
      .populate('child', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .exec();
  }

  /**
   * Récupérer une todolist par ID
   */
  async findOne(id: string, currentUser: any): Promise<TodoDocument> {
    const todo = await this.todoModel.findById(id)
      .populate('child', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .exec();

    if (!todo) {
      throw new NotFoundException('Todolist non trouvée');
    }

    // Vérifier les permissions
    await this.checkAccessPermission(todo, currentUser);

    return todo;
  }

  /**
   * Mettre à jour une todolist (PARENT uniquement)
   */
  async update(id: string, updateTodoDto: UpdateTodoDto, currentUser: any): Promise<TodoDocument> {
    if (currentUser.type !== 'user') {
      throw new ForbiddenException('Seuls les parents peuvent modifier des todolists');
    }

    const todo = await this.todoModel.findById(id);
    if (!todo) {
      throw new NotFoundException('Todolist non trouvée');
    }

    // Vérifier les permissions
    await this.checkModifyPermission(todo, currentUser);

    // Mettre à jour les champs
    if (updateTodoDto.title !== undefined) {
      todo.title = updateTodoDto.title;
    }
    if (updateTodoDto.description !== undefined) {
      todo.description = updateTodoDto.description;
    }
    if (updateTodoDto.tasks !== undefined) {
      todo.tasks = updateTodoDto.tasks.map(task => ({
        title: task.title,
        description: task.description || '',
        isCompleted: false,
        completedAt: null,
      }));
    }

    return todo.save();
  }

  /**
   * Supprimer une todolist (PARENT uniquement)
   */
  async remove(id: string, currentUser: any): Promise<void> {
    if (currentUser.type !== 'user') {
      throw new ForbiddenException('Seuls les parents peuvent supprimer des todolists');
    }

    const todo = await this.todoModel.findById(id);
    if (!todo) {
      throw new NotFoundException('Todolist non trouvée');
    }

    // Vérifier les permissions
    await this.checkModifyPermission(todo, currentUser);

    await this.todoModel.findByIdAndDelete(id).exec();
  }

  /**
   * Marquer une tâche comme complétée/incomplétée (ENFANT uniquement)
   */
  async updateTaskStatus(
    todoId: string,
    taskIndex: number,
    updateTaskStatusDto: UpdateTaskStatusDto,
    currentUser: any,
  ): Promise<TodoDocument> {
    if (currentUser.type !== 'child') {
      throw new ForbiddenException('Seuls les enfants peuvent modifier le statut des tâches');
    }

    const todo = await this.todoModel.findById(todoId);
    if (!todo) {
      throw new NotFoundException('Todolist non trouvée');
    }

    // Vérifier que l'enfant peut accéder à cette todolist
    const childId = new Types.ObjectId(currentUser.id);
    const todoChildId = new Types.ObjectId(todo.child);

    if (!todoChildId.equals(childId)) {
      throw new ForbiddenException('Vous n\'avez pas accès à cette todolist');
    }

    // Vérifier que l'index de la tâche est valide
    if (taskIndex < 0 || taskIndex >= todo.tasks.length) {
      throw new BadRequestException('Index de tâche invalide');
    }

    // Mettre à jour le statut de la tâche
    const task = todo.tasks[taskIndex];
    task.isCompleted = updateTaskStatusDto.isCompleted;
    task.completedAt = updateTaskStatusDto.isCompleted ? new Date() : null;

    return todo.save();
  }

  /**
   * Vérifier si l'utilisateur peut accéder à une todolist
   */
  private async checkAccessPermission(todo: TodoDocument, currentUser: any): Promise<void> {
    if (currentUser.type === 'child') {
      const childId = new Types.ObjectId(currentUser.id);
      const todoChildId = new Types.ObjectId(todo.child);
      if (!todoChildId.equals(childId)) {
        throw new ForbiddenException('Vous n\'avez pas accès à cette todolist');
      }
      return;
    }

    if (currentUser.role === 'ADMIN') {
      return;
    }

    // Pour les parents : vérifier qu'ils ont accès à l'enfant
    const parentId = new Types.ObjectId(currentUser.id);
    const child = await this.childModel.findById(todo.child);
    
    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    const childParentId = new Types.ObjectId(child.parent);
    const childLinkedParents = child.linkedParents.map(p => new Types.ObjectId(p));

    const isParent = childParentId.equals(parentId) || childLinkedParents.some(p => p.equals(parentId));

    if (!isParent) {
      throw new ForbiddenException('Vous n\'avez pas accès à cette todolist');
    }
  }

  /**
   * Vérifier si l'utilisateur peut modifier/supprimer une todolist
   */
  private async checkModifyPermission(todo: TodoDocument, currentUser: any): Promise<void> {
    if (currentUser.role === 'ADMIN') {
      return;
    }

    // Pour les parents : vérifier qu'ils ont créé la todolist ou qu'ils ont accès à l'enfant
    const parentId = new Types.ObjectId(currentUser.id);
    const todoCreatedBy = new Types.ObjectId(todo.createdBy);
    const child = await this.childModel.findById(todo.child);
    
    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    const childParentId = new Types.ObjectId(child.parent);
    const childLinkedParents = child.linkedParents.map(p => new Types.ObjectId(p));

    const isCreator = todoCreatedBy.equals(parentId);
    const isParent = childParentId.equals(parentId) || childLinkedParents.some(p => p.equals(parentId));

    if (!isCreator && !isParent) {
      throw new ForbiddenException('Vous n\'avez pas le droit de modifier cette todolist');
    }
  }
}

