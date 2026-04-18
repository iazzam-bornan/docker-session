"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAllUsers = findAllUsers;
exports.findUserById = findUserById;
exports.findUserByUsername = findUserByUsername;
const user_model_1 = require("@/models/user.model");
async function findAllUsers() {
    return user_model_1.User.find().sort({ createdAt: 1 }).lean();
}
async function findUserById(id) {
    return user_model_1.User.findById(id).lean();
}
async function findUserByUsername(username) {
    return user_model_1.User.findOne({ username }).lean();
}
