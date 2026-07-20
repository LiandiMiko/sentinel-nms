import prisma from "../../core/database/prisma.js";

class MetricRepository {

    async create(data) {
        return prisma.metric.create({
            data
        });
    }

    async findHistory(deviceId, name, limit = 100) {
        return prisma.metric.findMany({
            where: {
                deviceId,
                name
            },
            orderBy: {
                createdAt: "desc"
            },
            take: limit
        });
    }

    async count() {
    return prisma.metric.count();
}

    async latestMetric() {
        return prisma.metric.findFirst({
            orderBy: {
                createdAt: "desc"
            }
        });
    }
}

export default new MetricRepository();