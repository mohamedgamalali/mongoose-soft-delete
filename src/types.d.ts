import mongoose from 'mongoose';

declare module 'mongoose' {
  interface SchemaOptions {
    // all schemas have soft delete option
    softDelete?: boolean;
  }
  interface Schema extends mongoose.Schema {
    isSoftDelete?: boolean;
    softDeleteIndex(fields: IndexDefinition, options?: IndexOptions): this;
  }
}
