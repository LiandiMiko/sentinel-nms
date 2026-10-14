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
    nodeEnv: process.env.NODE_ENV || "development",
    initialAdminEmail: process.env.AUTH_INITIAL_ADMIN_EMAIL?.trim().toLowerCase() || "",
    initialAdminPassword: process.env.AUTH_INITIAL_ADMIN_PASSWORD || "",
    authCookieSecure: process.env.AUTH_COOKIE_SECURE === "true",
    trustProxy: process.env.TRUST_PROXY === "1" ? 1 : false,
    webOrigins: (process.env.WEB_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
};