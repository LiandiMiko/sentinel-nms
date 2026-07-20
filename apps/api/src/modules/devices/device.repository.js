import prisma from "../../core/database/prisma.js";

class DeviceRepository {
    async create(data) {
        return prisma.device.create({
            data
        });
    }

    async findAll() {
        return prisma.device.findMany({
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    async findEnabled() {
        return prisma.device.findMany({
            where: {
                enabled: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    async findById(id) {
        return prisma.device.findUnique({
            where: {
                id
            }
        });
    }

    async findByIp(ipAddress) {
        return prisma.device.findUnique({
            where: {
                ipAddress
            }
        });
    }

    async update(id, data) {
        return prisma.device.update({
            where: {
                id
            },
            data
        });
    }

    async delete(id) {
        return prisma.device.delete({
            where: {
                id
            }
        });
    }
    async updateLastSeen(id) {
    return prisma.device.update({
        where: { id },
        data: {
            lastSeen: new Date()
        }
    });
}
    async findAllWithMetrics() {
        return prisma.device.findMany({
            include: {
                metrics: {
                    orderBy: {
                        createdAt: "desc"
                    },
                    take: 2
                }
            },
            orderBy: {
                name: "asc"
            }
        });
    }
    
    async countAll() {
    return prisma.device.count();
}

async countUp() {
    const threshold = new Date(Date.now() - 30000);

    return prisma.device.count({
        where: {
            lastSeen: {
                gte: threshold
            }
        }
    });
}

async countDown() {
    const threshold = new Date(Date.now() - 30000);

    return prisma.device.count({
        where: {
            OR: [
                {
                    lastSeen: null
                },
                {
                    lastSeen: {
                        lt: threshold
                    }
                }
            ]
        }
    });
}
}

export default new DeviceRepository();
