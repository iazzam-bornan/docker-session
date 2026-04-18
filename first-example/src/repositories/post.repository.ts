import { Post } from '@/models/post.model';

export async function findAllPosts() {
  return Post.find()
    .populate('authorId', 'name username role')
    .sort({ createdAt: -1 })
    .lean();
}

export async function createPost(data: { title: string; content: string; authorId: string }) {
  const post = await Post.create(data);
  return post.toObject();
}