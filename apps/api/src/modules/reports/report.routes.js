import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./report.controller.js";

const router = Router();
router.get("/:type/:format", asyncHandler(controller.export.bind(controller)));

export default router;
