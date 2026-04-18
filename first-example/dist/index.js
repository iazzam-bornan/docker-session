"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("@/app"));
const config_1 = __importDefault(require("@/config"));
const connect_1 = __importDefault(require("@/database/connect"));
const seed_1 = require("@/database/seed");
async function bootstrap() {
    try {
        await (0, connect_1.default)();
        await (0, seed_1.seedDatabase)();
        app_1.default.listen(config_1.default.port, () => {
            console.log(`Server running at http://localhost:${config_1.default.port}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
bootstrap();
