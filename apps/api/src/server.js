import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./core/middleware/error-handler.js";
import { notFoundHandler } from "./core/middleware/not-found-handler.js";
import deviceRoutes from "./modules/devices/device.routes.js";
import metricRoutes from "./modules/metrics/metric.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));


app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/metrics", metricRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

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

const PORT = process.env.PORT || 3000;

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
    console.log("Mode   : " + (process.env.NODE_ENV || "development"));
    console.log("======================================\n");
});
