import { NextFunction, Request, Response } from 'express';
import config from '@/config';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || authHeader !== `Bearer ${config.authToken}`) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  next();
}