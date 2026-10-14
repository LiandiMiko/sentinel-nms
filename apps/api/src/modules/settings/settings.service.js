import prisma from "../../core/database/prisma.js";

const DEFAULT_SETTINGS = {
    pollingIntervalSeconds: 30,
    retentionEnabled: true,
    retentionDays: 90
};

class SettingsService {
    async get() {
        const settings = await prisma.systemSetting.findMany();
        const saved = new Map(settings.map(({ key, value }) => [key, value]));
        return {
            pollingIntervalSeconds: Number(saved.get("pollingIntervalSeconds") ?? DEFAULT_SETTINGS.pollingIntervalSeconds),
            retentionEnabled: saved.has("retentionEnabled")
                ? saved.get("retentionEnabled") === "true"
                : DEFAULT_SETTINGS.retentionEnabled,
            retentionDays: Number(saved.get("retentionDays") ?? DEFAULT_SETTINGS.retentionDays)
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
