import prisma from "../../core/database/prisma.js";

/** Outages shorter than this are treated as flaps and not kept in the log. */
const MIN_LOG_DURATION_MS = 60 * 1000;

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

        const endedAt = resolvedAt instanceof Date ? resolvedAt : new Date(resolvedAt);
        const startedAt = event.startedAt instanceof Date ? event.startedAt : new Date(event.startedAt);
        const durationMs = endedAt.getTime() - startedAt.getTime();

        // Flapping / brief blips: do not keep in the device log.
        if (Number.isFinite(durationMs) && durationMs < MIN_LOG_DURATION_MS) {
            await prisma.deviceEvent.delete({ where: { id: event.id } });
            return null;
        }

        return prisma.deviceEvent.update({
            where: { id: event.id },
            data: { resolvedAt: endedAt }
        });
    }

    async findByDevice(deviceId, limit = 100) {
        const events = await prisma.deviceEvent.findMany({
            where: { deviceId },
            orderBy: { startedAt: "desc" },
            take: Math.max(limit * 3, 100)
        });

        const filtered = events.filter((event) => {
            if (!event.resolvedAt) return true;
            const startedAt = event.startedAt instanceof Date ? event.startedAt : new Date(event.startedAt);
            const resolvedAt = event.resolvedAt instanceof Date ? event.resolvedAt : new Date(event.resolvedAt);
            const durationMs = resolvedAt.getTime() - startedAt.getTime();
            return !Number.isFinite(durationMs) || durationMs >= MIN_LOG_DURATION_MS;
        });

        return filtered.slice(0, limit);
    }
}

export default new DeviceEventRepository();
