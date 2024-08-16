import mongoose, { Document } from 'mongoose';

export interface SoftDeleteModel<T extends Document> extends mongoose.Model<T> {
  findDeleted(query: mongoose.FilterQuery<T>): Promise<T[]>;
  restore(
    query: mongoose.FilterQuery<T>,
    options?: { session?: mongoose.ClientSession },
  ): Promise<{ restored: number }>;
  softDelete<O extends { session?: mongoose.ClientSession; newDoc?: boolean }>(
    query: mongoose.FilterQuery<T>,
    options?: O,
  ): O extends { newDoc: true } ? Promise<T[]> : Promise<{ deletedCount: number }>;
  findOneAndSoftDelete(
    query: mongoose.FilterQuery<T>,
    options?: { session?: mongoose.ClientSession; newDoc?: boolean },
  ): Promise<T>;
}
