"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAllPosts = findAllPosts;
exports.createPost = createPost;
const post_model_1 = require("@/models/post.model");
async function findAllPosts() {
    return post_model_1.Post.find()
        .populate('authorId', 'name username role')
        .sort({ createdAt: -1 })
        .lean();
}
async function createPost(data) {
    const post = await post_model_1.Post.create(data);
    return post.toObject();
}
