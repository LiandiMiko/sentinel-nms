import { Router } from "express";
import { asyncHandler } from "../../core/middleware/async-handler.js";
import controller from "./group.controller.js";

const router = Router();
router.get("/", asyncHandler(controller.list.bind(controller)));
router.post("/", asyncHandler(controller.create.bind(controller)));
router.patch("/:id", asyncHandler(controller.update.bind(controller)));
router.delete("/:id", asyncHandler(controller.delete.bind(controller)));
router.put("/devices/:id", asyncHandler(controller.assign.bind(controller)));

export default router;
