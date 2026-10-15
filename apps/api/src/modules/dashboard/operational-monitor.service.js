import prisma from "../../core/database/prisma.js";
import operationsHealthService from "./operations-health.service.js";
import notificationService from "../alerts/notification.service.js";

const CHECK_INTERVAL_MS = 30_000;
const STARTUP_GRACE_MS = 60_000;
const MONITOR_STATE_PREFIX = "operationalMeta.";

class OperationalMonitorService {
    timer = null;
    checking = false;
    apiStartedAt = Date.now();
    warnedNoChannels = false;

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.check().catch((error) => console.error("[Operations] Meta-monitor check failed:", error));
        }, CHECK_INTERVAL_MS);
        this.timer.unref();
    }

    stop() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }

    async check() {
        if (this.checking) return;
        this.checking = true;
        try {
            const health = await operationsHealthService.get();
            const startupGraceComplete = Date.now() - this.apiStartedAt >= STARTUP_GRACE_MS;
            const workerOffline = startupGraceComplete && !health.worker.alive;
            const repeatedFailures = health.consecutiveFailedJobs >= 3;
            await this.transition("workerOffline", workerOffline, {
                title: workerOffline ? "Sentinel NMS worker is offline" : "Sentinel NMS worker recovered",
                message: workerOffline
                    ? `No worker heartbeat has been received for ${health.worker.heartbeatAgeSeconds ?? "an unknown number of"} seconds. The polling queue contains ${health.queue.pending + health.queue.processing + health.queue.retryWait} job(s).`
                    : "The polling worker heartbeat has resumed."
            });
            await this.transition("pollFailureStreak", repeatedFailures, {
                title: repeatedFailures ? "Sentinel NMS polling jobs are failing" : "Sentinel NMS polling recovered",
                message: repeatedFailures
                    ? `${health.consecutiveFailedJobs} consecutive polling job(s) failed after their retry attempts. Latest error: ${health.latestJob?.error ?? "not available"}`
                    : "Polling jobs are no longer failing consecutively."
            });
        } finally {
            this.checking = false;
        }
    }

    async transition(key, active, notification) {
        const stateKey = `${MONITOR_STATE_PREFIX}${key}`;
        const saved = await prisma.systemSetting.findUnique({ where: { key: stateKey } });
        const wasActive = saved?.value === "true";
        if (wasActive === active) return;
        if (active) {
            const result = await notificationService.sendOperationalNotification(notification);
            if (!result.attempted) {
                if (!this.warnedNoChannels) {
                    console.warn("[Operations] Worker/failure notifications are active but no enabled notification channels are configured.");
                    this.warnedNoChannels = true;
                }
                return;
            }
            if (result.delivered === 0) return;
            this.warnedNoChannels = false;
        } else if (!wasActive) {
            await prisma.systemSetting.upsert({
                where: { key: stateKey },
                update: { value: "false" },
                create: { key: stateKey, value: "false" }
            });
            return;
        } else {
            const result = await notificationService.sendOperationalNotification(notification);
            if (!result.attempted) {
                console.warn("[Operations] Recovery occurred but no enabled notification channel can deliver it.");
            }
        }
        await prisma.systemSetting.upsert({
            where: { key: stateKey },
            update: { value: String(active) },
            create: { key: stateKey, value: String(active) }
        });
    }
}

export default new OperationalMonitorService();
