import { Router } from "express";
import metricController from "./metric.controller.js";
import { asyncHandler } from "../../core/middleware/async-handler.js";

const router = Router();

router.get(
    "/device/:id",
    asyncHandler(metricController.history.bind(metricController))
);

router.post("/poll", asyncHandler(metricController.poll.bind(metricController)));
router.get(
    "/device/:id/interfaces",
    asyncHandler(metricController.interfaces.bind(metricController))
);

export default router;
