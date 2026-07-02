import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

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
