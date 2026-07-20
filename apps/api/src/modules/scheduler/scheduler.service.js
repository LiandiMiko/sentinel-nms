import cron from "node-cron";
import metricService from "../metrics/metric.service.js";

class SchedulerService {
    start() {
        console.log("Starting Scheduler...");

        cron.schedule("*/30 * * * * *", async () => {
            console.log(
                `[Scheduler] ${new Date().toISOString()} Polling devices...`
            );

            try {
                const result = await metricService.pollAll();

                console.log(
                    `[Scheduler] Done. UP=${result.up} DOWN=${result.down}`
                );
            } catch (err) {
                console.error("[Scheduler] Error:", err.message);
            }
        });
    }
}

export default new SchedulerService();