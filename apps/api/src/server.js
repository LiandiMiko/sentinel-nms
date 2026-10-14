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
import schedulerService from "./modules/scheduler/scheduler.service.js";

const app = express();

app.set("etag", false);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});


app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/metrics", metricRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/alerts", alertRoutes);
app.use("/api/v1/groups", groupRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/discovery", discoveryRoutes);
app.use("/api/v1/reports", reportRoutes);


app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        service: "Sentinel NMS API",
        version: "0.1.0",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.use(notFoundHandler);
app.use(errorHandler);
schedulerService.start();

const PORT = env.port;

process.on("uncaughtException", (err) => {
    console.error("=== UNCAUGHT EXCEPTION ===");
    console.error(err);
});

process.on("unhandledRejection", (err) => {
    console.error("=== UNHANDLED REJECTION ===");
    console.error(err);
});

app.listen(PORT, () => {
    console.log("\n======================================");
    console.log("Sentinel NMS API");
    console.log("======================================");
    console.log("Status : Running");
    console.log("Port   : " + PORT);
    console.log("Mode   : " + env.nodeEnv);
    console.log("======================================\n");
});
