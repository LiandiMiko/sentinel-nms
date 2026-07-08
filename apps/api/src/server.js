import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import deviceRoutes from "./modules/devices/device.routes.js";
import metricRoutes from "./modules/metrics/metric.routes.js";
import { metricRoutes } from "./modules/metrics/index.js";

console.log("cwd =", process.cwd());
console.log("env =", process.env.DATABASE_URL);

dotenv.config();

const app = express();

app.use((req, res, next) => {
    console.log(req.method, req.url);
    next();
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/metrics", metricRoutes);

app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        service: "Sentinel NMS API",
        version: "0.1.0",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

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
    console.log(`
======================================
🛡 Sentinel NMS API
======================================
Status : Running
Port   : ${PORT}
Mode   : ${process.env.NODE_ENV || "development"}
======================================
`);
});
