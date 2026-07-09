import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./metric.controller.js";

const router = Router();

router.post("/poll", asyncHandler(controller.poll.bind(controller)));

router.get(
    "/:deviceId/:metric/history",
    asyncHandler(controller.history.bind(controller))
);

export default router;
