import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
dotenv.config({ path: resolve(apiDirectory, ".env") });

if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
        throw new Error("DATABASE_URL must be configured in production.");
    }
    process.env.DATABASE_URL = "file:./dev.db";
}

export default {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development"
};