import '../../src/index';
import { SoftDeleteModel } from '../../src/index';
import mongoose from 'mongoose';
interface UserDocument extends mongoose.Document {
    username: string;
    email: string;
    isDeleted: boolean;
    deletedAt?: Date;
}
const UserSchema = new mongoose.Schema({
    username: String,
    email: String,
}, { softDelete: true });
UserSchema.softDeleteIndex({ email: 1 }, { unique: true });
export const UserInstance = mongoose.model<UserDocument, SoftDeleteModel<UserDocument>>('User', UserSchema);

interface PostsDocument extends mongoose.Document {
    title: string;
    user: mongoose.Types.ObjectId;
    isDeleted: boolean;
    deletedAt?: Date;
}
const PostsSchema = new mongoose.Schema({
    title: String,
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: true,
    }
}, { softDelete: true });
export const PostsInstance = mongoose.model<PostsDocument, SoftDeleteModel<PostsDocument>>('Post', PostsSchema);
