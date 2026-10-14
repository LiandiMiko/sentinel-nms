import cron from "node-cron";
import metricService from "../metrics/metric.service.js";
import settingsService from "../settings/settings.service.js";

class SchedulerService {
    start() {
        console.log("Starting Scheduler...");
        let polling = false;
        let lastPollAt = 0;
        let lastRetentionDate = "";

        cron.schedule("*/5 * * * * *", async () => {
            try {
                const settings = await settingsService.get();
                const now = Date.now();
                const today = new Date().toISOString().slice(0, 10);

                if (!polling && now - lastPollAt >= settings.pollingIntervalSeconds * 1000) {
                    polling = true;
                    lastPollAt = now;
                    console.log(`[Scheduler] ${new Date().toISOString()} Polling devices...`);
                    try {
                        const result = await metricService.pollAll();
                        console.log(`[Scheduler] Done. UP=${result.up} DOWN=${result.down}`);
                    } finally {
                        polling = false;
                    }
                }

                if (settings.retentionEnabled && today !== lastRetentionDate) {
                    lastRetentionDate = today;
                    const result = await settingsService.retainMetrics();
                    if (result.deleted > 0) {
                        console.log(`[Scheduler] Retention removed ${result.deleted} old metric rows`);
                    }
                }
            } catch (err) {
                console.error("[Scheduler] Error:", err.message);
            }
        });
    }
}

export default new SchedulerService();