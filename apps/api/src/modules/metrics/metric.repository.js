import prisma from "../../core/database/prisma.js";

class MetricRepository {

    async create(data) {
        return prisma.metric.create({
            data
        });
    }

    async findHistory(deviceId, metricName, limit) {
        return prisma.metric.findMany({
            where: {
                deviceId,
                name: metricName
            },
            orderBy: {
                createdAt: "desc"
            },
            take: limit
        });
    }

    async findHistoryWindow(deviceId, metricName, rangeSeconds, maxPoints) {
        const start = Date.now() - rangeSeconds * 1000;
        const bucketSeconds = Math.max(1, Math.ceil(rangeSeconds / maxPoints));
        return prisma.$queryRaw`
            SELECT "id", "deviceId", "oid", "name", "value", "unit", "createdAt"
            FROM (
                SELECT
                    "id", "deviceId", "oid", "name", "value", "unit", "createdAt",
                    ROW_NUMBER() OVER (
                        PARTITION BY CAST(("createdAt" - ${start}) / (${bucketSeconds} * 1000) AS INTEGER)
                        ORDER BY "createdAt" DESC, "id" DESC
                    ) AS "bucketRank"
                FROM "Metric"
                WHERE "deviceId" = ${deviceId}
                    AND "name" = ${metricName}
                    AND "createdAt" >= ${start}
            )
            WHERE "bucketRank" = 1
            ORDER BY "createdAt" ASC
        `;
    }

    async findLatestInterfaceMetrics(deviceId) {
        return prisma.metric.findMany({
            where: {
                deviceId,
                name: { startsWith: "interface." }
            },
            orderBy: { createdAt: "desc" },
            take: 5000
        });
    }

    async findLatestSystemMetrics(deviceId) {
        return prisma.metric.findMany({
            where: {
                deviceId,
                NOT: { name: { startsWith: "interface." } }
            },
            orderBy: { createdAt: "desc" },
            take: 1000
        });
    }

    async findLatestInterfaceStatuses(deviceId) {
        return prisma.metric.findMany({
            where: {
                deviceId,
                name: { startsWith: "interface." }
            },
            orderBy: { createdAt: "desc" },
            take: 5000
        });
    }

    async upsertSnapshot(data) {
        return prisma.deviceSnapshot.upsert({
            where: {
                deviceId: data.deviceId
            },
            update: {
                hostname: data.hostname,
                uptime: data.uptime,
                cpu: data.cpu,
                lastSeen: data.lastSeen
            },
            create: data
        });
    }

    async createMany(data) {
        if (data.length === 0) return;
        return prisma.metric.createMany({ data });
    }
    
    async latest(deviceId, limit = 50) {

        return prisma.metric.findMany({
            where: {
                deviceId
            },
            orderBy: {
                createdAt: "desc"
            },
            take: limit
        });

    }

}

export default new MetricRepository();