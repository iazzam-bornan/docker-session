import { NextFunction, Request, Response } from 'express';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(error);

  res.status(500).json({
    success: false,
    message: error.message || 'Internal server error',
  });
}