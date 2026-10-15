import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import { requireRole } from "../auth/auth.middleware.js";
import controller from "./device.controller.js";

const router = Router();

router.get("/", asyncHandler(controller.findAll));
router.get("/:id", asyncHandler(controller.findById));
router.post("/", requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.create));
router.patch("/:id", requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.update));
router.get("/:id/routeros", asyncHandler(controller.routerOs.bind(controller)));
router.delete("/:id", requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.delete));


export default router;