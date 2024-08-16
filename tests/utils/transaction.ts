import mongoose, { ClientSession, Connection } from 'mongoose';

export const runInTransaction = async <T>(transaction: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.connection.startSession();
  let result;

  try {
    session.startTransaction();
    result = await transaction(session);
    await session.commitTransaction();
  } catch (error) {
    console.error('Transaction failed: ', error);
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    session.endSession();
  }

  return result;
};