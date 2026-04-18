import * as userRepo from "@/repositories/user.repository"

export async function getAllUsers() {
  return userRepo.findAllUsers();
}

export async function getUserById(id: string) {
  return userRepo.findUserById(id)
}