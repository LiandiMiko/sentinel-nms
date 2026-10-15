import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import env from "./core/config/env.js";
import { errorHandler } from "./core/middleware/error-handler.js";
import { notFoundHandler } from "./core/middleware/not-found-handler.js";
import deviceRoutes from "./modules/devices/device.routes.js";
import metricRoutes from "./modules/metrics/metric.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import alertRoutes from "./modules/alerts/alert.routes.js";
import groupRoutes from "./modules/devices/group.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import discoveryRoutes from "./modules/discovery/discovery.routes.js";
import reportRoutes from "./modules/reports/report.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/auth/user.routes.js";
import auditRoutes from "./modules/auth/audit.routes.js";
import authService from "./modules/auth/auth.service.js";
import { authenticate, csrfProtection, enforceRolePermissions } from "./modules/auth/auth.middleware.js";
import { auditRequest } from "./modules/auth/audit.middleware.js";
import prisma from "./core/database/prisma.js";

const app = express();
const allowedOrigins = new Set(env.webOrigins);

app.set("etag", false);
app.set("trust proxy", env.trustProxy);
app.use(helmet());
app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        service: "Sentinel NMS API",
        version: "0.1.0",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/audit-log", auditRoutes);
app.use("/api/v1", authenticate, auditRequest, csrfProtection(allowedOrigins), enforceRolePermissions);
app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/metrics", metricRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/alerts", alertRoutes);
app.use("/api/v1/groups", groupRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/discovery", discoveryRoutes);
app.use("/api/v1/reports", reportRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = env.port;

process.on("uncaughtException", (err) => {
    console.error("=== UNCAUGHT EXCEPTION ===");
    console.error(err);
});

process.on("unhandledRejection", (err) => {
    console.error("=== UNHANDLED REJECTION ===");
    console.error(err);
});

async function start() {
    await authService.initialize();
    app.listen(PORT, () => {
        console.log("\n======================================");
        console.log("Sentinel NMS API");
        console.log("======================================");
        console.log("Status : Running");
        console.log("Port   : " + PORT);
        console.log("Mode   : " + env.nodeEnv);
        console.log("======================================\n");
    });
}

start().catch((error) => {
    console.error("[Startup] API could not start:", error);
    prisma.$disconnect()
        .catch((disconnectError) => console.error("[Startup] Could not disconnect Prisma:", disconnectError))
        .finally(() => { process.exitCode = 1; });
});
