import { Router } from "express";
import controller from "./metric.controller.js";

const router = Router();

router.post("/poll", (req, res, next) => {

    console.log("==== ROUTE ====");

    next();

}, controller.poll);

export default router;