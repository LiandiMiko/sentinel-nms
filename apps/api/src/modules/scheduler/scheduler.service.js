import cron from "node-cron";
import metricService from "../metrics/metric.service.js";
import settingsService from "../settings/settings.service.js";
import pollJobService, { processNextPollJob } from "./poll-job.service.js";
import sqliteBackupService from "./sqlite-backup.service.js";
import prisma from "../../core/database/prisma.js";
import { validateRuntimeConfiguration } from "../../core/config/runtime-validation.js";
import { recordWorkerHeartbeat } from "../dashboard/operations-health.service.js";

class SchedulerService {
    task = null;
    activeTick = null;
    heartbeatTask = null;
    lastPollAt = 0;
    lastRetentionDate = "";
    lastBackupDate = "";
    lastBackupAttemptAt = 0;

    async start() {
        if (this.task) return;
        await validateRuntimeConfiguration(prisma);
        await recordWorkerHeartbeat();
        this.heartbeatTask = setInterval(() => {
            recordWorkerHeartbeat().catch((error) => {
                console.error("[Worker] Could not update worker heartbeat:", error);
            });
        }, 10_000);
        this.heartbeatTask.unref();
        const requeued = await pollJobService.requeueAbandoned();
        if (requeued > 0) console.warn(`[Worker] Re-queued ${requeued} abandoned polling job(s).`);

        console.log("[Worker] Starting polling and retention scheduler.");
        this.task = cron.schedule("*/5 * * * * *", () => {
            this.tick().catch((error) => console.error("[Worker] Scheduler tick failed:", error));
        });
    }

    async tick() {
        if (this.activeTick) return this.activeTick;
        this.activeTick = this.runTick();
        try {
            await this.activeTick;
        } finally {
            this.activeTick = null;
        }
    }

    async runTick() {
        try {
            const requeued = await pollJobService.requeueAbandoned();
            if (requeued > 0) console.warn(`[Worker] Re-queued ${requeued} abandoned polling job(s).`);

            const settings = await settingsService.get();
            const now = Date.now();
            const today = new Date().toISOString().slice(0, 10);

            if (today !== this.lastBackupDate && now - this.lastBackupAttemptAt >= 15 * 60 * 1000) {
                this.lastBackupAttemptAt = now;
                const { backupPath, created } = await sqliteBackupService.createSQLiteBackup();
                const removedBackups = await sqliteBackupService.pruneSQLiteBackups();
                this.lastBackupDate = today;
                console.log(`[Worker] SQLite backup ${created ? "created" : "already exists"}: ${backupPath}`);
                if (removedBackups > 0) {
                    console.log(`[Worker] Removed ${removedBackups} expired SQLite backup(s).`);
                }
            }

            if (now - this.lastPollAt >= settings.pollingIntervalSeconds * 1000) {
                if (await pollJobService.hasActiveJob()) {
                    this.lastPollAt = now;
                } else {
                    await pollJobService.enqueue();
                    this.lastPollAt = now;
                }
            }

            await processNextPollJob(pollJobService, metricService);

            if (today !== this.lastRetentionDate) {
                if (settings.retentionEnabled) {
                    const result = await settingsService.retainMetrics();
                    if (result.deleted > 0) {
                        console.log(`[Worker] Retention removed ${result.deleted} old metric rows.`);
                    }
                }
                const removedJobs = await pollJobService.removeOldJobs();
                if (removedJobs > 0) console.log(`[Worker] Removed ${removedJobs} old polling job(s).`);
                this.lastRetentionDate = today;
            }
        } catch (error) {
            console.error("[Worker] Scheduler error:", error);
        }
    }

    async stop() {
        if (this.heartbeatTask) {
            clearInterval(this.heartbeatTask);
            this.heartbeatTask = null;
        }
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
        if (this.activeTick) await this.activeTick;
        console.log("[Worker] Scheduler stopped.");
    }
}

export default new SchedulerService();
