import prisma from "./core/database/prisma.js";
import schedulerService from "./modules/scheduler/scheduler.service.js";

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[Worker] Received ${signal}; stopping scheduler.`);
    try {
        await schedulerService.stop();
        await prisma.$disconnect();
        process.exitCode = 0;
    } catch (error) {
        console.error("[Worker] Graceful shutdown failed:", error);
        process.exitCode = 1;
    }
}

process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });

async function start() {
    await schedulerService.start();
}

start().catch(async (error) => {
    console.error("[Worker] Could not start:", error);
    await prisma.$disconnect().catch((disconnectError) => {
        console.error("[Worker] Could not disconnect Prisma:", disconnectError);
    });
    process.exitCode = 1;
});
