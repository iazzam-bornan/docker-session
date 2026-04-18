import { User } from '@/models/user.model';

export async function findAllUsers() {
  return User.find().sort({ createdAt: 1 }).lean();
}

export async function findUserById(id: string) {
  return User.findById(id).lean();
}

export async function findUserByUsername(username: string) {
  return User.findOne({ username }).lean();
}