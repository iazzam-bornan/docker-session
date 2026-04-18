"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = connectToDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("@/config"));
async function connectToDatabase() {
    await mongoose_1.default.connect(config_1.default.mongoUri, {
        serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB');
}
