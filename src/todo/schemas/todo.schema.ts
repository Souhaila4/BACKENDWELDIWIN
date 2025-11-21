import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Child } from '../../child/schemas/child.schema';

export type TodoDocument = Todo & Document;

export interface Task {
  title: string;
  description?: string;
  isCompleted: boolean;
  completedAt?: Date;
}

@Schema({ timestamps: true })
export class Todo {
  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'Child', required: true })
  child: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId; // Parent who created this todolist

  @Prop({
    type: [
      {
        title: { type: String, required: true },
        description: { type: String, default: '' },
        isCompleted: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
      },
    ],
    default: [],
  })
  tasks: Task[];
}

export const TodoSchema = SchemaFactory.createForClass(Todo);

