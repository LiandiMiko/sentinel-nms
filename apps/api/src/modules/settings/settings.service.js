import prisma from "../../core/database/prisma.js";

const DEFAULT_SETTINGS = {
    pollingIntervalSeconds: 30,
    retentionEnabled: true,
    retentionDays: 90
};

class SettingsService {
    async get() {
        const [settings, pageCountRows, pageSizeRows, recentMetricStorage] = await Promise.all([
            prisma.systemSetting.findMany(),
            prisma.$queryRaw`PRAGMA page_count`,
            prisma.$queryRaw`PRAGMA page_size`,
            prisma.$queryRaw`
                SELECT
                    COALESCE(SUM(length("name") + length("value") + length("oid") + COALESCE(length("unit"), 0) + 48), 0) AS "estimatedBytes",
                    COUNT(*) AS "count",
                    MIN("createdAt") AS "firstSample"
                FROM "Metric"
                WHERE "createdAt" >= datetime('now', '-7 days')
            `
        ]);
        const saved = new Map(settings.map(({ key, value }) => [key, value]));
        const retentionDays = Number(saved.get("retentionDays") ?? DEFAULT_SETTINGS.retentionDays);
        const sampleBytes = Number(recentMetricStorage[0]?.estimatedBytes ?? 0);
        const metricCount = Number(recentMetricStorage[0]?.count ?? 0);
        const firstSampleAt = recentMetricStorage[0]?.firstSample
            ? new Date(recentMetricStorage[0].firstSample)
            : null;
        const daysObserved = firstSampleAt
            ? Math.max(1, Math.min(7, (Date.now() - firstSampleAt.getTime()) / 86400_000))
            : 1;
        const estimatedDailyMetricBytes = sampleBytes / daysObserved;
        const databaseBytes = Number(pageCountRows[0]?.page_count ?? 0)
            * Number(pageSizeRows[0]?.page_size ?? 0);
        return {
            pollingIntervalSeconds: Number(saved.get("pollingIntervalSeconds") ?? DEFAULT_SETTINGS.pollingIntervalSeconds),
            retentionEnabled: saved.has("retentionEnabled")
                ? saved.get("retentionEnabled") === "true"
                : DEFAULT_SETTINGS.retentionEnabled,
            retentionDays,
            storage: {
                databaseBytes,
                metricSamplesLast7Days: metricCount,
                metricBytesLast7Days: sampleBytes,
                estimatedDailyMetricBytes,
                estimatedRetainedMetricBytes: Math.round(estimatedDailyMetricBytes * retentionDays)
            }
        };
    }

    async update(values) {
        await prisma.$transaction(
            Object.entries(values).map(([key, value]) => prisma.systemSetting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            }))
        );
        return this.get();
    }

    async retainMetrics() {
        const settings = await this.get();
        if (!settings.retentionEnabled) return { deleted: 0 };
        const cutoff = new Date(Date.now() - settings.retentionDays * 86400_000);
        const result = await prisma.metric.deleteMany({
            where: { createdAt: { lt: cutoff } }
        });
        return { deleted: result.count };
    }
}

export default new SettingsService();
