import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./dashboard.controller.js";

const router = Router();

router.get(
    "/devices",
    asyncHandler(controller.devices.bind(controller))
);

router.get(
    "/summary",
    asyncHandler(controller.summary.bind(controller))
);

router.get(
    "/devices/:id",
    asyncHandler(controller.getDevice.bind(controller))
);

export default router;