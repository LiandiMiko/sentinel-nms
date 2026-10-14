import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import authController from "./auth.controller.js";
import { authenticate, createLoginRateLimiter, csrfProtection } from "./auth.middleware.js";
import env from "../../core/config/env.js";

const router = Router();
const allowedOrigins = new Set(env.webOrigins);

router.post("/login", csrfProtection(allowedOrigins), createLoginRateLimiter(), asyncHandler(authController.login.bind(authController)));
router.get("/me", authenticate, asyncHandler(authController.me.bind(authController)));
router.post("/logout", authenticate, csrfProtection(allowedOrigins), asyncHandler(authController.logout.bind(authController)));
router.post("/password", authenticate, csrfProtection(allowedOrigins), asyncHandler(authController.changePassword.bind(authController)));

export default router;
