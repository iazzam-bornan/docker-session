"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const routes_1 = __importDefault(require("@/routes"));
const errorHandler_1 = require("@/middlewares/errorHandler");
const notFound_1 = require("@/middlewares/notFound");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/css', express_1.default.static(path_1.default.join(process.cwd(), 'public', 'css')));
app.use('/js', express_1.default.static(path_1.default.join(process.cwd(), 'public', 'js')));
app.use(routes_1.default);
app.use(notFound_1.notFound);
app.use(errorHandler_1.errorHandler);
exports.default = app;
