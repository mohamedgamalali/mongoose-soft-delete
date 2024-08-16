import mongoose, { IndexDefinition, IndexOptions } from 'mongoose';
import { appendSoftDeleteFieldsToIndex, softDeletePlugin } from './utils/plugin';
import type * as customMongooseTypes from 'mongoose';
mongoose.Schema = class extends mongoose.Schema {
  constructor(definition, options) {
    // Call the original constructor
    super(definition, options);
    if (options?.softDelete) {
      this.plugin(softDeletePlugin);
      this.isSoftDelete = true;
    } else {
      this.isSoftDelete = false;
    }
  }
  softDeleteIndex(fields: IndexDefinition, options?: IndexOptions) {
    if (!this.isSoftDelete) throw new Error('cannot use softDelete index with hard delete schema');
    const newFields = appendSoftDeleteFieldsToIndex(fields, options);
    this.index(newFields, options);
    return this;
  }
} as typeof mongoose.Schema;

export { mongoose, customMongooseTypes };
