import { Request, Response } from 'express';
import * as userService from '@/services/user.service';

export async function getUsers(req: Request, res: Response) {
  const users = await userService.getAllUsers();

  res.status(200).json({
    success: true,
    data: users,
  });
}

export async function getUserById(req: Request, res: Response) {
  const user = await userService.getUserById(req.params.id as string);

  res.status(200).json({
    success: true,
    data: user,
  });
}