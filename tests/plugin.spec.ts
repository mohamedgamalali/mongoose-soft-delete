import { UserInstance, PostsInstance } from './utils/test-models';
import { runInTransaction } from './utils/transaction';
import mongoose from 'mongoose';
describe('Soft delete plugin tests', () => {
    let users;
    beforeAll(async () => {
        await mongoose.connect('mongodb://localhost:27017/soft-delete-test-mode?directConnection=true');
        await UserInstance.deleteMany({});
        await PostsInstance.deleteMany({});
        users = await Promise.all([
            new UserInstance({
                username: 'user',
                email: `test-1-${Date.now()}@test.com`
            }).save(),
            new UserInstance({
                username: 'user',
                email: `test-2-${Date.now()}@test.com`
            }).save(),
            new UserInstance({
                username: 'user',
                email: `test-3-${Date.now()}@test.com`
            }).save(),
            new UserInstance({
                username: 'user',
                email: `test-4-${Date.now()}@test.com`
            }).save(),
        ]);
    });
    it('test soft delete for user model', async () => {
        const userToDelete = await UserInstance.find({ _id: users[0]._id });
        expect(userToDelete).toHaveLength(1);
        let totalUsers = await UserInstance.find({  }).countDocuments();
        expect(totalUsers).toBe(4);
        const result = await UserInstance.softDelete({ _id: userToDelete[0]?._id });
        expect(result.deletedCount).toBe(1);
        const deleteWithDocs = await UserInstance.softDelete({ _id: users[3]?._id }, { newDoc: true });
        expect(deleteWithDocs[0]._id).toEqual(users[3]._id);
        await UserInstance.restore({ _id: users[3]?._id });
        //should soft delete
        let deletedUser = await UserInstance.find({ _id: userToDelete[0]?._id });
        expect(deletedUser).toHaveLength(0);
        const deletedFindOne = await UserInstance.findOne({ _id: userToDelete[0]?._id });
        expect(deletedFindOne).toBeNull();
        const foundDeleted = await UserInstance.findOne({ _id: userToDelete[0]?._id, isDeleted: true });
        expect(foundDeleted).not.toBeNull();
        //insure countDocument hook is execluding deleted
        totalUsers = await UserInstance.find({  }).countDocuments();
        expect(totalUsers).toBe(3);
        //insure aggregate $match is respecting soft deleted records
        const usersWithAggregate = await UserInstance.aggregate([
          { $match: {  } },
        ]);
        expect(usersWithAggregate).toHaveLength(3);
        const getDeletedWithAggregate = await UserInstance.aggregate([
          { $match: { isDeleted: true } },
        ]);
        expect(getDeletedWithAggregate).toHaveLength(1);
        // find by id should just query with id
        const deletedById = await UserInstance.findById(userToDelete[0]?._id, null, { skipHook: true });
        expect(deletedById?.isDeleted).toBeTruthy();
        //update queries should only update undeleted ones
        await UserInstance.updateMany({  }, { $set: { username: 'updatedName' } });
        const deletedUsersAfterUpdate = await UserInstance.findDeleted({  });
        expect(deletedUsersAfterUpdate[0].username).not.toBe('updatedName');
        //should restore
        const restoreRes = await UserInstance.restore({ _id: userToDelete[0]?._id });
        expect(restoreRes.restored).toBe(1);
        deletedUser = await UserInstance.find({ _id: userToDelete[0]?._id });
        expect(deletedUser).toHaveLength(1);
        expect(deletedUser[0].isDeleted).toBeFalsy();
      });
      it('soft deleting/restore should respect sessions', async () => {
        const userToBeDeleted = users[1];
        try {
          await runInTransaction(async (session) => {
            await UserInstance.softDelete({ _id: userToBeDeleted._id }, { session });
            throw new Error('transaction failed to continue');
          });
        } catch (err) {
          const deleted = await UserInstance.findDeleted({ _id: userToBeDeleted._id });
          expect(deleted).toHaveLength(0);
        }
        //if transaction commited
        await runInTransaction(async (session) => {
          await UserInstance.softDelete({ _id: userToBeDeleted._id }, { session });
        });
        const deleted = await UserInstance.findDeleted({ _id: userToBeDeleted._id });
        expect(deleted).toHaveLength(1);
        try {
          await runInTransaction(async (session) => {
            await UserInstance.restore({ _id: userToBeDeleted._id }, { session });
            throw new Error('transaction failed to continue');
          });
        } catch (err) {
          const deleted = await UserInstance.findDeleted({ _id: userToBeDeleted._id });
          expect(deleted).toHaveLength(1); //should not restore if transactiton failed
        }
      });
      it('test findOneAndSoftDelete', async () => {
        const userToBeDeleted = users[2];
    
        const deleted = await UserInstance.findOneAndSoftDelete({ _id: userToBeDeleted._id }, { newDoc: true });
        expect(deleted.isDeleted).toBeTruthy();
        expect(deleted._id).toEqual(userToBeDeleted._id);
      });
      it('test soft delete indexes', async () => {
        const user1 = await new UserInstance({
            username: 'user1',
            email: 'user1@mail.com',
        }).save();
        try {
            const user2 = await new UserInstance({
                username: 'user1',
                email: 'user1@mail.com',
            }).save();
            expect(1).toBe(2);
        } catch (error) {
            console.log('unique index works');
        }
        await UserInstance.softDelete({ _id: user1._id });
        const user2 = await new UserInstance({
            username: 'user1',
            email: 'user1@mail.com',
        }).save();
        expect(user2).not.toBeNull();
      });
      it('match loockups in aggregate should respect deleted fields', async () => {
        const userTest1 = await new UserInstance({
            username: `aggregate-user-${Date.now()}`,
            email: `aggregate-user-${Date.now()}`,
        }).save()
        let users = await UserInstance.find({ username: userTest1.username })
        expect(users.length).toBe(1);
        
        const post1 = await new PostsInstance({
            user: userTest1._id,
            title: 'new post',
        }).save();
        let usersWithPosts = await UserInstance.aggregate([
            {
                $lookup: {
                    from: 'posts',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'posts',
                },
            },
            {
                $project: {
                    username: 1,
                    email: 1,
                    posts: { $size: '$posts' },
                },
            },
            {
                $match: {
                    posts: { $gte: 1 }
                }
            }
        ]);
        expect(usersWithPosts).toHaveLength(1);
        expect(usersWithPosts[0].username).toBe(userTest1.username);
        expect(usersWithPosts[0].posts).toBe(1);
        await PostsInstance.softDelete({ _id: post1._id });
        usersWithPosts = await UserInstance.aggregate([
            {
                $lookup: {
                    from: 'posts',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'posts',
                },
            },
            {
                $project: {
                    username: 1,
                    email: 1,
                    posts: { $size: '$posts' },
                },
            },
            {
                $match: {
                    posts: { $gte: 1 }
                }
            }
        ]);
        expect(usersWithPosts).toHaveLength(0);
      });
    afterAll(async () => await mongoose.disconnect());
});