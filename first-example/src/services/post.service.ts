import * as postRepo from "@/repositories/post.repository";
import { findUserByUsername } from "@/repositories/user.repository";

console.log("postRepo:", postRepo);

export async function getAllPosts() {
  return postRepo.findAllPosts();
}

export async function createNewPost(data: {
  title: string;
  content: string;
  username: string;
}) {
  const user = await findUserByUsername(data.username);

  if (!user || !user._id) {
    throw new Error("Author user not found!");
  }

  return postRepo.createPost({
    title: data.title,
    content: data.content,
    authorId: String(user._id),
  });
}
