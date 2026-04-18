import mongoose from 'mongoose';
import config from '@/config';

export default async function connectToDatabase() {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log('Connected to MongoDB');
}