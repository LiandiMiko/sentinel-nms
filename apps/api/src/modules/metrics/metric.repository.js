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