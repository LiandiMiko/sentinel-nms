import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import { authenticate, requireRole } from "./auth.middleware.js";
import auditController from "./audit.controller.js";

const router = Router();

router.use(authenticate, requireRole("SUPER_ADMIN"));
router.get("/", asyncHandler(auditController.list.bind(auditController)));

export default router;
