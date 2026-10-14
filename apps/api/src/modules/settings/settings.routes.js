import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./settings.controller.js";

const router = Router();
router.get("/", asyncHandler(controller.get.bind(controller)));
router.patch("/", asyncHandler(controller.update.bind(controller)));

export default router;
