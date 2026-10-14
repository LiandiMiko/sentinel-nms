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