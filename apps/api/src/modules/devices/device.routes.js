import { Router } from "express";
import controller from "./device.controller.js";

console.log("✅ Device routes loaded");

const router = Router();

router.get("/", (req, res, next) => {
    console.log("GET /devices hit");
    next();
}, controller.findAll);

router.post("/", controller.create);

console.log("===== DEVICE ROUTES =====");

router.stack.forEach((layer) => {
    console.log(
        layer.route?.path,
        Object.keys(layer.route?.methods || {})
    );
});

export default router;