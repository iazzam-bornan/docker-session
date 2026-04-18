"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const post_controller_1 = require("@/controllers/post.controller");
const auth_middleware_1 = require("@/middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_1.authMiddleware, post_controller_1.getPosts);
router.post('/', auth_middleware_1.authMiddleware, post_controller_1.createPost);
exports.default = router;
