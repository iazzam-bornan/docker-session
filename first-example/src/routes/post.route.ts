import { Router } from 'express';
import { createPost, getPosts } from '@/controllers/post.controller';
import { authMiddleware } from '@/middlewares/auth.middleware';

const router = Router();

router.get('/', authMiddleware, getPosts);
router.post('/', authMiddleware, createPost);

export default router;