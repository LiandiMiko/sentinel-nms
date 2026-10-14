import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import authController from "./auth.controller.js";
import { authenticate, csrfProtection, requireRole } from "./auth.middleware.js";
import env from "../../core/config/env.js";

const router = Router();

router.use(authenticate, requireRole("SUPER_ADMIN"), csrfProtection(new Set(env.webOrigins)));
router.get("/", asyncHandler(authController.listUsers.bind(authController)));
router.post("/", asyncHandler(authController.createUser.bind(authController)));
router.patch("/:id", asyncHandler(authController.updateUser.bind(authController)));
router.delete("/:id", asyncHandler(authController.deleteUser.bind(authController)));

export default router;
