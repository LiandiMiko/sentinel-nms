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
                lastSeen: new Date(),
                status: "up",
                downSince: null,
                lastError: null
            }
        });
    }

    async markDown(id, message) {
        const device = await prisma.device.findUnique({
            where: { id },
            select: { downSince: true }
        });
        if (!device) return;
        return prisma.device.update({
            where: { id },
            data: {
                status: "down",
                downSince: device.downSince ?? new Date(),
                lastError: message.slice(0, 500)
            }
        });
    }
    async findAllWithMetrics(filters = {}) {
        const conditions = [];
        if (filters.search) {
            conditions.push({
                OR: [
                    { name: { contains: filters.search } },
                    { ipAddress: { contains: filters.search } }
                ]
            });
        }
        if (filters.groupId) conditions.push({ groups: { some: { groupId: filters.groupId } } });
        if (filters.tagId) conditions.push({ tags: { some: { tagId: filters.tagId } } });
        if (filters.status === "DISABLED") conditions.push({ enabled: false });
        if (filters.status === "UP") {
            conditions.push({
                enabled: true,
                status: "up",
                lastSeen: { gte: new Date(Date.now() - 90_000) }
            });
        }
        if (filters.status === "DOWN") {
            conditions.push({
                enabled: true,
                OR: [
                    { status: { not: "up" } },
                    { lastSeen: null },
                    { lastSeen: { lt: new Date(Date.now() - 90_000) } }
                ]
            });
        }
        return prisma.device.findMany({
            where: conditions.length ? { AND: conditions } : undefined,
            include: {
                snapshot: true,
                groups: { include: { group: { select: { id: true, name: true } } } },
                tags: { include: { tag: { select: { id: true, name: true } } } }
            },
            orderBy: { name: "asc" }
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

async updateSnapshot(deviceId, data) {
    return prisma.deviceSnapshot.upsert({
        where: {
            deviceId
        },
        update: {
            hostname: data.hostname,
            uptime: data.uptime,
            cpu: data.cpu,
            lastSeen: new Date()
        },
        create: {
            deviceId,
            hostname: data.hostname,
            uptime: data.uptime,
            cpu: data.cpu,
            lastSeen: new Date()
        }
    });
}

async countMetrics() {
    return prisma.metric.count();
}
}

export default new DeviceRepository();