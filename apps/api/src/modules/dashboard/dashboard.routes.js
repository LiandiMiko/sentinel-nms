import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./dashboard.controller.js";

const router = Router();

router.get(
    "/devices",
    asyncHandler(controller.devices.bind(controller))
);

export default router;