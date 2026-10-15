import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const environment = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db"
};
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const schema = resolve(process.cwd(), "prisma/schema.prisma");
const generatedClient = resolve(dirname(require.resolve("@prisma/client")), "../../.prisma/client/default.js");

const commands = [];
if (!existsSync(generatedClient)) {
    commands.push(["generate", "--schema", schema]);
} else {
    console.log("[API] Existing Prisma Client found; skipping generate to avoid replacing an engine used by a running API or worker.");
    console.log("[API] After changing Prisma models, stop API/worker processes and run `npm run db:generate --workspace=api`.");
}
commands.push(["migrate", "deploy", "--schema", schema]);

for (const command of commands) {
    const result = spawnSync(process.execPath, [prismaCli, ...command], {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit"
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
