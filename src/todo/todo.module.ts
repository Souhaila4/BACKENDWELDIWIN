import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TodoController } from './todo.controller';
import { TodoService } from './todo.service';
import { Todo, TodoSchema } from './schemas/todo.schema';
import { Child, ChildSchema } from '../child/schemas/child.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Todo.name, schema: TodoSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [TodoController],
  providers: [TodoService],
  exports: [TodoService],
})
export class TodoModule {}

