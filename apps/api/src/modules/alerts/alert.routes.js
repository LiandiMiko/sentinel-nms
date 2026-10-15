import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import { requireRole } from "../auth/auth.middleware.js";
import alertController from "./alert.controller.js";
import notificationController from "./notification.controller.js";

const router = Router();

router.get("/rules", asyncHandler(alertController.listRules.bind(alertController)));
router.post("/rules", requireRole('ADMIN','SUPER_ADMIN'), asyncHandler(alertController.createRule.bind(alertController)));
router.patch("/rules/:id", requireRole('ADMIN','SUPER_ADMIN'), asyncHandler(alertController.updateRule.bind(alertController)));
router.delete("/rules/:id", requireRole('ADMIN','SUPER_ADMIN'), asyncHandler(alertController.deleteRule.bind(alertController)));

router.get("/events", asyncHandler(alertController.listEvents.bind(alertController)));
router.patch("/events/:id/acknowledge", asyncHandler(alertController.acknowledge.bind(alertController)));

router.get("/channels", asyncHandler(notificationController.list.bind(notificationController)));
router.post("/channels", requireRole('ADMIN','SUPER_ADMIN'), asyncHandler(notificationController.create.bind(notificationController)));
router.patch("/channels/:id", requireRole('ADMIN','SUPER_ADMIN'), asyncHandler(notificationController.update.bind(notificationController)));
router.delete("/channels/:id", requireRole('ADMIN','SUPER_ADMIN'), asyncHandler(notificationController.remove.bind(notificationController)));
router.post("/channels/test", asyncHandler(notificationController.test.bind(notificationController)));

export default router;
