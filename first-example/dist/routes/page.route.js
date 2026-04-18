"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const page_controller_1 = require("@/controllers/page.controller");
const router = (0, express_1.Router)();
router.get('/', page_controller_1.getHomePage);
exports.default = router;
