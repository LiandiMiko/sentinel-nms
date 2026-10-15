import { randomUUID } from "node:crypto";
import prisma from "../../core/database/prisma.js";

const toJob = (row) => row ? ({
    id: row.id,
    status: row.status,
    requestedAt: row.requestedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error
}) : null;

export async function requeueAbandonedPollJobs(database, maxAgeMs = 15 * 60 * 1000) {
    const maxAgeSeconds = Math.max(1, Math.floor(maxAgeMs / 1000));
    return database.$executeRaw`
        UPDATE "PollJob"
        SET "status" = CASE WHEN "attempts" < "maxAttempts" THEN 'PENDING' ELSE 'FAILED' END,
            "startedAt" = NULL,
            "completedAt" = CASE WHEN "attempts" < "maxAttempts" THEN NULL ELSE CURRENT_TIMESTAMP END,
            "nextAttemptAt" = NULL,
            "error" = CASE WHEN "attempts" < "maxAttempts" THEN NULL ELSE 'Maximum poll attempts reached after worker interruption.' END
        WHERE "status" = 'PROCESSING'
            AND datetime("startedAt") < datetime('now', '-' || ${maxAgeSeconds} || ' seconds')
    `;
}

class PollJobService {
    async enqueue() {
        const id = randomUUID();
        await prisma.$executeRaw`
            INSERT INTO "PollJob" ("id", "status", "requestedAt", "attempts", "maxAttempts")
            VALUES (${id}, 'PENDING', CURRENT_TIMESTAMP, 0, 3)
        `;
        return this.get(id);
    }

    async get(id) {
        const rows = await prisma.$queryRaw`
            SELECT "id", "status", "requestedAt", "startedAt", "completedAt",
                "attempts", "maxAttempts", "nextAttemptAt", "result", "error"
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
            WHERE "status" IN ('PENDING', 'RETRY_WAIT')
                AND ("nextAttemptAt" IS NULL OR datetime("nextAttemptAt") <= datetime('now'))
            ORDER BY "requestedAt" ASC
            LIMIT 1
        `;
        const jobId = rows[0]?.id;
        if (!jobId) return null;

        const claimed = await prisma.$executeRaw`
            UPDATE "PollJob"
            SET "status" = 'PROCESSING',
                "startedAt" = CURRENT_TIMESTAMP,
                "attempts" = "attempts" + 1,
                "nextAttemptAt" = NULL,
                "error" = NULL
            WHERE "id" = ${jobId}
                AND "status" IN ('PENDING', 'RETRY_WAIT')
                AND ("nextAttemptAt" IS NULL OR datetime("nextAttemptAt") <= datetime('now'))
        `;
        if (claimed !== 1) return null;
        return this.get(jobId);
    }

    async hasActiveJob() {
        const rows = await prisma.$queryRaw`
            SELECT 1 AS "active"
            FROM "PollJob"
            WHERE "status" IN ('PENDING', 'PROCESSING', 'RETRY_WAIT')
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
        const job = await this.get(id);
        if (!job || job.status !== "PROCESSING") return;
        const message = String(error?.message ?? error).slice(0, 2000);
        if (job.attempts < job.maxAttempts) {
            const delaySeconds = Math.min(300, 15 * (2 ** Math.max(0, job.attempts - 1)));
            await prisma.$executeRaw`
                UPDATE "PollJob"
                SET "status" = 'RETRY_WAIT',
                    "startedAt" = NULL,
                    "nextAttemptAt" = datetime('now', '+' || ${delaySeconds} || ' seconds'),
                    "error" = ${message}
                WHERE "id" = ${id} AND "status" = 'PROCESSING'
            `;
            return this.get(id);
        }
        await prisma.$executeRaw`
            UPDATE "PollJob"
            SET "status" = 'FAILED',
                "completedAt" = CURRENT_TIMESTAMP,
                "nextAttemptAt" = NULL,
                "error" = ${message}
            WHERE "id" = ${id} AND "status" = 'PROCESSING'
        `;
        return this.get(id);
    }

    async requeueAbandoned(maxAgeMs = 15 * 60 * 1000) {
        return requeueAbandonedPollJobs(prisma, maxAgeMs);
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
        const failedJob = await jobs.fail(job.id, error);
        if (failedJob?.status === "RETRY_WAIT") {
            logger.error(`[Worker] Poll job ${job.id} failed on attempt ${failedJob.attempts}/${failedJob.maxAttempts}; retry scheduled for ${failedJob.nextAttemptAt}:`, error);
        } else {
            logger.error(`[Worker] Poll job ${job.id} exhausted its retry attempts:`, error);
        }
    }
    return true;
}

export default new PollJobService();
