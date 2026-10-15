import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { requeueAbandonedPollJobs } from "../src/modules/scheduler/poll-job.service.js";

const directories = [];
const clients = [];

after(async () => {
    await Promise.all(clients.map((client) => client.$disconnect()));
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("abandoned polling job recovery", () => {
    it("requeues stale processing jobs but leaves recent jobs running", async () => {
        const directory = await mkdtemp(join(tmpdir(), "sentinel-worker-recovery-"));
        directories.push(directory);
        const databasePath = join(directory, "poll-jobs.db");
        const fixture = new DatabaseSync(databasePath);
        fixture.exec(`
            CREATE TABLE "PollJob" (
                "id" TEXT PRIMARY KEY,
                "status" TEXT NOT NULL,
                "startedAt" DATETIME,
                "error" TEXT,
                "attempts" INTEGER NOT NULL DEFAULT 0,
                "maxAttempts" INTEGER NOT NULL DEFAULT 3,
                "completedAt" DATETIME,
                "nextAttemptAt" DATETIME
            );
            INSERT INTO "PollJob" VALUES
                ('stale-job', 'PROCESSING', datetime('now', '-30 minutes'), 'worker stopped'),
                ('recent-job', 'PROCESSING', datetime('now', '-1 minute'), NULL);
        `);
        fixture.close();

        const client = new PrismaClient({
            datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } },
            log: ["error"]
        });
        clients.push(client);

        assert.equal(await requeueAbandonedPollJobs(client, 15 * 60 * 1000), 1);
        const result = new DatabaseSync(databasePath, { readOnly: true });
        try {
            const rows = result.prepare(
                `SELECT "id", "status", "startedAt", "error" FROM "PollJob"`
            ).all();
            const staleJob = rows.find(({ id }) => id === "stale-job");
            const recentJob = rows.find(({ id }) => id === "recent-job");
            assert.deepEqual({
                status: staleJob.status,
                startedAt: staleJob.startedAt,
                error: staleJob.error
            }, { status: "PENDING", startedAt: null, error: null });
            assert.equal(recentJob.status, "PROCESSING");
            assert.ok(recentJob.startedAt);
            assert.equal(recentJob.error, null);
        } finally {
            result.close();
        }
    });
});
