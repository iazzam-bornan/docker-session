import { Request, Response } from 'express';
import path from 'path';

export function getHomePage(req: Request, res: Response) {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
}