import {
    CallbackError,
    MongooseQueryMiddleware,
    ClientSession,
    Schema,
    IndexDefinition,
    IndexOptions,
    PipelineStage,
  } from 'mongoose';
  
  const QUERY_METHODS: MongooseQueryMiddleware[] = [
    'find',
    'findOne',
    'count',
    'countDocuments',
    'updateMany',
    'updateOne',
    'findOneAndUpdate',
    'distinct',
  ];
  export const softDeletePlugin = (schema: Schema) => {
    //delete schema params
    schema.add({
      isDeleted: {
        type: Boolean,
        required: false,
        default: false,
      },
      deletedAt: {
        type: Date,
        default: null,
      },
    });
    //pre hooks for query methods
    schema.pre(QUERY_METHODS, async function (this, next: (err?: CallbackError) => void) {
      if (this.getOptions().skipHook) return next();
      if (this.getFilter().isDeleted === true) {
        return next();
      }
      this.setQuery({ ...this.getFilter(), isDeleted: { $ne: true } });
      next();
    });
    schema.pre('aggregate', function (next) {
      overwriteAggregatePiplineForSoftDelete(this.pipeline());
      next();
    });
    schema.statics = {
      async findDeleted(query) {
        return this.find({ ...query, isDeleted: true });
      },
      async restore(query, { session }: { session?: ClientSession } = {}) {
        // add {isDeleted: true} because the method find is set to filter the non deleted documents only,
        // so if we don't add {isDeleted: true}, it won't be able to find it
        const updateQuery = {
          ...query,
          isDeleted: true,
        };
        try {
          const updateResult = await this.updateMany(
            updateQuery,
            { $set: { isDeleted: false, deletedAt: null, createdAt: new Date() } }, //updating createdAt to ensure sync with redshift
            { session },
          );
          return { restored: updateResult.modifiedCount };
        } catch (err: any) {
          throw new Error(err.name + ' ' + err.message);
        }
      },
      async softDelete(query, { session, newDoc }: { session?: ClientSession; newDoc?: boolean } = {}) {
        try {
          const deletedAt = new Date();
          const updateResult = await this.updateMany(query, { $set: { isDeleted: true, deletedAt } }, { session });
          if (!newDoc) {
            return { deletedCount: updateResult.modifiedCount };
          } else {
            return await this.find({ ...query, isDeleted: true, deletedAt }, {}, { session });
          }
        } catch (err: any) {
          throw new Error(err.name + ' ' + err.message);
        }
      },
      async findOneAndSoftDelete(query, { session, newDoc }: { session?: ClientSession; newDoc?: boolean } = {}) {
        try {
          return await this.findOneAndUpdate(
            query,
            { $set: { isDeleted: true, deletedAt: new Date() } },
            { session, new: newDoc },
          );
        } catch (err: any) {
          throw new Error(err.name + ' ' + err.message);
        }
      },
    };
    schema.index({ isDeleted: 1 }); //useful for aggregation filtering
  };
  
  export const appendSoftDeleteFieldsToIndex = (fields: IndexDefinition, options?: IndexOptions) => {
    if (!fields.isDeleted) fields = { ...fields, isDeleted: 1 };
    if (options?.unique && !fields.deletedAt) fields = { ...fields, deletedAt: 1 };
    return fields;
  };
  type $AddFieldsType = {
    [k: string]: { $filter: { input: `$${string}`; as: string; cond: { $ne: [string, boolean] } } };
  };
  export const overwriteAggregatePiplineForSoftDelete = (pipeline: PipelineStage[]) => {
    pipeline.forEach((stage, index) => {
      const lookupStage = stage['$lookup'];
      if (lookupStage) {
        if (
          lookupStage.from &&
          lookupStage.localField &&
          lookupStage.foreignField &&
          lookupStage.as &&
          !lookupStage.localField.includes('.') //execlude nested lookups
        ) {
          const { as } = lookupStage;
          const addFieldStage: { $addFields: $AddFieldsType } = {
            $addFields: {},
          };
          addFieldStage.$addFields[`${as}`] = {
            $filter: {
              input: `$${as}`,
              as: 'temp',
              cond: { $ne: ['$$temp.isDeleted', true] },
            },
          };
          pipeline.splice(index + 1, 0, addFieldStage);
        }
      }
      const matchStage = stage['$match'];
      if (matchStage) {
        if (matchStage.isDeleted === true) return;
        pipeline[index]['$match'] = { ...matchStage, isDeleted: { $ne: true } };
      }
    });
    return pipeline;
  };
  