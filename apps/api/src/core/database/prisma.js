import "../config/env.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
    log: ["error", "warn"]
});

export default prisma;