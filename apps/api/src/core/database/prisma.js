import { PrismaClient } from "@prisma/client";

console.log("DATABASE_URL =", process.env.DATABASE_URL);

const prisma = new PrismaClient({
    log: ["query", "error", "warn"]
});

export default prisma;