import { Router } from 'express';
import { getUserById, getUsers } from '@/controllers/user.controller';
import { authMiddleware } from '@/middlewares/auth.middleware';

const router = Router();

router.get('/', authMiddleware, getUsers);
router.get('/:id', authMiddleware, getUserById);

export default router;