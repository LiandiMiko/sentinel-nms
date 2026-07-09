import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./device.controller.js";

const router = Router();

router.get("/", asyncHandler(controller.findAll));
router.get("/:id", asyncHandler(controller.findById));
router.post("/", asyncHandler(controller.create));
router.patch("/:id", asyncHandler(controller.update));
router.delete("/:id", asyncHandler(controller.delete));

export default router;
