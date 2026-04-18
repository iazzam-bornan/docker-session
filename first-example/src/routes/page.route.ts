import { Router } from 'express';
import { getHomePage } from '@/controllers/page.controller';

const router = Router();

router.get('/', getHomePage);

export default router;