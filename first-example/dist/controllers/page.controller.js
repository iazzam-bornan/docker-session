"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHomePage = getHomePage;
const path_1 = __importDefault(require("path"));
function getHomePage(req, res) {
    res.sendFile(path_1.default.join(process.cwd(), 'public', 'index.html'));
}
