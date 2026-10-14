import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./discovery.controller.js";

const router = Router();
router.post("/scan", asyncHandler(controller.scan.bind(controller)));

export default router;
