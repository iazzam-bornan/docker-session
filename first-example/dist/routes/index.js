"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const page_route_1 = __importDefault(require("@/routes/page.route"));
const user_route_1 = __importDefault(require("@/routes/user.route"));
const post_route_1 = __importDefault(require("@/routes/post.route"));
const health_route_1 = __importDefault(require("@/routes/health.route"));
const router = (0, express_1.Router)();
router.use('/', page_route_1.default);
router.use('/api/users', user_route_1.default);
router.use('/api/posts', post_route_1.default);
router.use('/health', health_route_1.default);
exports.default = router;
