"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(error, req, res, next) {
    console.error(error);
    res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
    });
}
