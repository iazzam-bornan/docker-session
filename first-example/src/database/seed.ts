import { User } from '@/models/user.model';
import { Post } from '@/models/post.model';

export async function seedDatabase() {
  const userCount = await User.countDocuments();

  if (userCount > 0) {
    return;
  }

  const users = await User.insertMany([
    { name: 'Islam', username: 'snowydev', role: 'admin' },
    { name: 'Murad', username: 'muraddev', role: 'user' },
    { name: 'Salem', username: 'salem', role: 'user' },
  ]);

  await Post.insertMany([
    {
      title: 'Docker makes this app work everywhere',
      content: 'This is the first seeded post in the demo app.',
      authorId: users[0]._id,
    },
    {
      title: 'Node version mismatch is painful',
      content: 'This app is useful for showing why environment consistency matters.',
      authorId: users[1]._id,
    },
  ]);

  console.log('Seeded initial data');
}