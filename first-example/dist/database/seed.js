"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDatabase = seedDatabase;
const user_model_1 = require("@/models/user.model");
const post_model_1 = require("@/models/post.model");
async function seedDatabase() {
    const userCount = await user_model_1.User.countDocuments();
    if (userCount > 0) {
        return;
    }
    const users = await user_model_1.User.insertMany([
        { name: 'Islam', username: 'snowydev', role: 'admin' },
        { name: 'Murad', username: 'muraddev', role: 'user' },
        { name: 'Salem', username: 'salem', role: 'user' },
    ]);
    await post_model_1.Post.insertMany([
        {
            title: 'Docker makes this app work everywhere',
            content: 'This is the first seeded post in the demo app.',
            authorId: users[0]._id,
        },
        {
            title: 'Node version mismatch is painful',
            content: 'This app is useful for showing why environment consistency matters.',
            authorId: users[1]._id,
        },
    ]);
    console.log('Seeded initial data');
}
