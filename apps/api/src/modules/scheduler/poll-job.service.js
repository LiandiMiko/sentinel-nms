import { randomUUID } from "node:crypto";
import prisma from "../../core/database/prisma.js";

const toJob = (row) => row ? ({
    id: row.id,
    status: row.status,
    requestedAt: row.requestedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error
}) : null;

class PollJobService {
    async enqueue() {
        const id = randomUUID();
        await prisma.$executeRaw`
            INSERT INTO "PollJob" ("id", "status", "requestedAt")
            VALUES (${id}, 'PENDING', CURRENT_TIMESTAMP)
        `;
        return this.get(id);
    }

    async get(id) {
        const rows = await prisma.$queryRaw`
            SELECT "id", "status", "requestedAt", "startedAt", "completedAt", "result", "error"
            FROM "PollJob"
            WHERE "id" = ${id}
            LIMIT 1
        `;
        return toJob(rows[0]);
    }

    async claimNext() {
        const rows = await prisma.$queryRaw`
            SELECT "id"
            FROM "PollJob"
            WHERE "status" = 'PENDING'
            ORDER BY "requestedAt" ASC
            LIMIT 1
        `;
        const jobId = rows[0]?.id;
        if (!jobId) return null;

        const claimed = await prisma.$executeRaw`
            UPDATE "PollJob"
            SET "status" = 'PROCESSING', "startedAt" = CURRENT_TIMESTAMP, "error" = NULL
            WHERE "id" = ${jobId} AND "status" = 'PENDING'
        `;
        if (claimed !== 1) return null;
        return this.get(jobId);
    }

    async hasActiveJob() {
        const rows = await prisma.$queryRaw`
            SELECT 1 AS "active"
            FROM "PollJob"
            WHERE "status" IN ('PENDING', 'PROCESSING')
            LIMIT 1
        `;
        return rows.length > 0;
    }

    async complete(id, result) {
        await prisma.$executeRaw`
            UPDATE "PollJob"
            SET "status" = 'COMPLETED',
                "completedAt" = CURRENT_TIMESTAMP,
                "result" = ${JSON.stringify(result)},
                "error" = NULL
            WHERE "id" = ${id} AND "status" = 'PROCESSING'
        `;
    }

    async fail(id, error) {
        await prisma.$executeRaw`
            UPDATE "PollJob"
            SET "status" = 'FAILED',
                "completedAt" = CURRENT_TIMESTAMP,
                "error" = ${String(error?.message ?? error).slice(0, 2000)}
            WHERE "id" = ${id} AND "status" = 'PROCESSING'
        `;
    }

    async requeueAbandoned(maxAgeMs = 15 * 60 * 1000) {
        const maxAgeSeconds = Math.max(1, Math.floor(maxAgeMs / 1000));
        const count = await prisma.$executeRaw`
            UPDATE "PollJob"
            SET "status" = 'PENDING', "startedAt" = NULL, "error" = NULL
            WHERE "status" = 'PROCESSING'
                AND datetime("startedAt") < datetime('now', '-' || ${maxAgeSeconds} || ' seconds')
        `;
        return count;
    }

    async removeOldJobs(retentionDays = 7) {
        const cutoff = new Date(Date.now() - retentionDays * 86400_000);
        return prisma.$executeRaw`
            DELETE FROM "PollJob"
            WHERE "completedAt" IS NOT NULL AND "completedAt" < ${cutoff}
        `;
    }
}

export async function processNextPollJob(jobs, metricService, logger = console) {
    const job = await jobs.claimNext();
    if (!job) return false;

    try {
        const result = await metricService.pollAll();
        await jobs.complete(job.id, {
            total: result.total,
            up: result.up,
            down: result.down
        });
        logger.info(`[Worker] Poll job ${job.id} completed. UP=${result.up} DOWN=${result.down}`);
    } catch (error) {
        await jobs.fail(job.id, error);
        logger.error(`[Worker] Poll job ${job.id} failed:`, error);
    }
    return true;
}

export default new PollJobService();
