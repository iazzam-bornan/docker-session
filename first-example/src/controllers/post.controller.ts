import { Request, Response } from 'express';
import * as postService from '@/services/post.service';

export async function getPosts(req: Request, res: Response) {
  const posts = await postService.getAllPosts();

  res.status(200).json({
    success: true,
    data: posts,
  });
}

export async function createPost(req: Request, res: Response) {
  const { title, content, username } = req.body;

  const post = await postService.createNewPost({
    title,
    content,
    username,
  });

  res.status(201).json({
    success: true,
    data: post,
  });
}