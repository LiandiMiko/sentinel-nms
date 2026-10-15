import cron from "node-cron";
import metricService from "../metrics/metric.service.js";
import settingsService from "../settings/settings.service.js";
import pollJobService, { processNextPollJob } from "./poll-job.service.js";

class SchedulerService {
    task = null;
    activeTick = null;
    lastPollAt = 0;
    lastRetentionDate = "";

    async start() {
        if (this.task) return;
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
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
        if (this.activeTick) await this.activeTick;
        console.log("[Worker] Scheduler stopped.");
    }
}

export default new SchedulerService();
