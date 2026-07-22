import { Router } from "express";
import metricController from "./metric.controller.js";

const router = Router();

router.get(
    "/device/:id",
    metricController.history
);

export default router;
