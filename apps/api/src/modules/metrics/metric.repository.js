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
}

export default new MetricRepository();