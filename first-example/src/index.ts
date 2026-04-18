import app from '@/app';
import config from '@/config';
import connectToDatabase from '@/database/connect';
import { seedDatabase } from '@/database/seed';

async function bootstrap() {
  try {
    await connectToDatabase();
    await seedDatabase();

    app.listen(config.port, () => {
      console.log(`Server running at http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();