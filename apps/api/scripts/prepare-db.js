import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const environment = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db"
};
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const schema = resolve(process.cwd(), "prisma/schema.prisma");

for (const command of [
    ["generate", "--schema", schema],
    ["migrate", "deploy", "--schema", schema]
]) {
    const result = spawnSync(process.execPath, [prismaCli, ...command], {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit"
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
