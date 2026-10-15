import prisma from "../../core/database/prisma.js";

const WORKER_HEARTBEAT_KEY = "workerHeartbeatAt";
const WORKER_STALE_AFTER_MS = 30_000;
const META_WORKER_KEY = "operationalMeta.workerOffline";
const META_FAILURE_KEY = "operationalMeta.pollFailureStreak";
const FAILURE_STREAK_THRESHOLD = 3;

export async function recordWorkerHeartbeat(database = prisma, now = new Date()) {
    await database.systemSetting.upsert({
        where: { key: WORKER_HEARTBEAT_KEY },
        update: { value: now.toISOString() },
        create: { key: WORKER_HEARTBEAT_KEY, value: now.toISOString() }
    });
}

class OperationsHealthService {
    async get() {
        const [heartbeat, queueRows, recentJobs, latestJobRows, latestSuccessfulRows, databaseStats, metaWorker, metaFailures, channelCount] = await Promise.all([
            prisma.systemSetting.findUnique({ where: { key: WORKER_HEARTBEAT_KEY } }),
            prisma.$queryRaw`
                SELECT "status", COUNT(*) AS "count"
                FROM "PollJob"
                WHERE "status" IN ('PENDING', 'PROCESSING', 'RETRY_WAIT')
                GROUP BY "status"
            `,
            prisma.$queryRaw`
                SELECT "status", "completedAt", "attempts", "maxAttempts", "nextAttemptAt", "error"
                FROM "PollJob"
                WHERE "status" IN ('COMPLETED', 'FAILED')
                ORDER BY COALESCE("completedAt", "nextAttemptAt") DESC, "requestedAt" DESC
                LIMIT 50
            `,
            prisma.$queryRaw`
                SELECT "id", "status", "requestedAt", "startedAt", "completedAt",
                    "attempts", "maxAttempts", "nextAttemptAt", "error"
                FROM "PollJob"
                ORDER BY "requestedAt" DESC
                LIMIT 1
            `,
            prisma.$queryRaw`
                SELECT "completedAt"
                FROM "PollJob"
                WHERE "status" = 'COMPLETED' AND "completedAt" IS NOT NULL
                ORDER BY "completedAt" DESC
                LIMIT 1
            `,
            prisma.$queryRaw`PRAGMA page_count`,
            prisma.systemSetting.findUnique({ where: { key: META_WORKER_KEY } }),
            prisma.systemSetting.findUnique({ where: { key: META_FAILURE_KEY } }),
            prisma.notificationChannel.count({ where: { enabled: true } })
        ]);
        const pageSizeRows = await prisma.$queryRaw`PRAGMA page_size`;
        const queue = { pending: 0, processing: 0, retryWait: 0 };
        for (const row of queueRows) {
            if (row.status === "PENDING") queue.pending = Number(row.count);
            if (row.status === "PROCESSING") queue.processing = Number(row.count);
            if (row.status === "RETRY_WAIT") queue.retryWait = Number(row.count);
        }
        const heartbeatAt = heartbeat?.value ? new Date(heartbeat.value) : null;
        const heartbeatAgeMs = heartbeatAt ? Math.max(0, Date.now() - heartbeatAt.getTime()) : null;
        let consecutiveFailedJobs = 0;
        for (const job of recentJobs) {
            if (job.status !== "FAILED") break;
            consecutiveFailedJobs += 1;
        }
        const pageCount = Number(databaseStats[0]?.page_count ?? 0);
        const pageSize = Number(pageSizeRows[0]?.page_size ?? 0);

        const workerAlive = heartbeatAgeMs !== null && heartbeatAgeMs <= WORKER_STALE_AFTER_MS;
        const workerOfflineActive = metaWorker?.value === "true";
        const pollFailureActive = metaFailures?.value === "true";
        const notificationsConfigured = channelCount > 0;

        let metaStatus = "watching";
        let metaSummary = "Meta-alerts are watching the worker and poll job streak.";
        if (!notificationsConfigured) {
            metaStatus = "no-channels";
            metaSummary = "No enabled notification channels. Meta-alerts will not be delivered.";
        } else if (workerOfflineActive || pollFailureActive) {
            metaStatus = "firing";
            const parts = [];
            if (workerOfflineActive) parts.push("worker offline");
            if (pollFailureActive) parts.push(`${consecutiveFailedJobs || "several"} consecutive poll failures`);
            metaSummary = `Active: ${parts.join(" · ")}. Notifications were sent to enabled channels.`;
        } else if (!workerAlive) {
            metaStatus = "degraded";
            metaSummary = "Worker heartbeat is stale. A meta-alert will fire after the API startup grace period if this continues.";
        } else if (consecutiveFailedJobs >= FAILURE_STREAK_THRESHOLD) {
            metaStatus = "degraded";
            metaSummary = `${consecutiveFailedJobs} consecutive failed jobs detected. Meta-alert state is updating.`;
        }

        return {
            worker: {
                alive: workerAlive,
                lastHeartbeatAt: heartbeatAt,
                heartbeatAgeSeconds: heartbeatAgeMs === null ? null : Math.floor(heartbeatAgeMs / 1000)
            },
            queue,
            lastSuccessfulPollAt: latestSuccessfulRows[0]?.completedAt ?? null,
            consecutiveFailedJobs,
            latestJob: latestJobRows[0] ?? null,
            databaseBytes: pageCount * pageSize,
            metaAlerts: {
                status: metaStatus,
                summary: metaSummary,
                notificationsConfigured,
                workerOffline: workerOfflineActive,
                pollFailureStreak: pollFailureActive,
                failureStreakThreshold: FAILURE_STREAK_THRESHOLD
            }
        };
    }
}

export default new OperationsHealthService();
