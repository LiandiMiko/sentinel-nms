import prisma from "../../core/database/prisma.js";

class DeviceEventRepository {
    async start({ deviceId, type, subject, message, startedAt }) {
        const existing = await prisma.deviceEvent.findFirst({
            where: { deviceId, type, subject, resolvedAt: null },
            select: { id: true }
        });
        if (existing) return existing;
        return prisma.deviceEvent.create({
            data: { deviceId, type, subject, message, startedAt }
        });
    }

    async resolve({ deviceId, type, subject, resolvedAt }) {
        const event = await prisma.deviceEvent.findFirst({
            where: { deviceId, type, subject, resolvedAt: null },
            orderBy: { startedAt: "desc" }
        });
        if (!event) return null;
        return prisma.deviceEvent.update({
            where: { id: event.id },
            data: { resolvedAt }
        });
    }

    async findByDevice(deviceId, limit = 100) {
        return prisma.deviceEvent.findMany({
            where: { deviceId },
            orderBy: { startedAt: "desc" },
            take: limit
        });
    }
}

export default new DeviceEventRepository();
