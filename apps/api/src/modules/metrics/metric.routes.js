import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./metric.controller.js";

const router = Router();

router.post("/poll", asyncHandler(controller.poll));

export default router;
