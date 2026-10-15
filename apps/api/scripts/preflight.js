import prisma from "../src/core/database/prisma.js";
import { inspectRuntimeConfiguration } from "../src/core/config/runtime-validation.js";

try {
    const { errors, warnings } = await inspectRuntimeConfiguration(prisma);
    for (const warning of warnings) console.warn(`[Preflight] Warning: ${warning}`);
    for (const error of errors) console.error(`[Preflight] ERROR: ${error}`);
    if (errors.length) {
        process.exitCode = 1;
    } else {
        console.log("[Preflight] Environment and database checks passed.");
    }
} catch (error) {
    console.error("[Preflight] Could not inspect environment/database:", error.message);
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
