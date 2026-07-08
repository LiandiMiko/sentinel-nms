import prisma from "../../core/database/prisma.js";

class MetricRepository {

    async create(data) {
        return prisma.metric.create({
            data
        });
    }

}

export default new MetricRepository();