import deviceRepository from "../devices/device.repository.js";
import metricRepository from "../metrics/metric.repository.js";
import prisma from "../../core/database/prisma.js";

class DashboardService {
    async devices() {
        const devices = await deviceRepository.findAllWithMetrics();

        return devices.map((device) => {
            const now = Date.now();

            const lastSeen = device.snapshot?.lastSeen ?? device.lastSeen;

            const lastSeenTime = lastSeen
                ? new Date(lastSeen).getTime()
                    : 0;

            const status =
                device.lastSeen && now - lastSeenTime < 30000
                    ? "UP"
                    : "DOWN";

            const metrics = {
                hostname: device.snapshot?.hostname,
                uptime: device.snapshot?.uptime,
                cpu: device.snapshot?.cpu
};

            return {
                id: device.id,
                name: device.name,
                ipAddress: device.ipAddress,
                status,
                lastSeen: lastSeen,
                metrics
            };
        });
    }

    async summary() {
        const devices = await this.devices();

        return {
            totalDevices: devices.length,
            upDevices: devices.filter((d) => d.status === "UP").length,
            downDevices: devices.filter((d) => d.status === "DOWN").length,
            totalMetrics: await deviceRepository.countMetrics(),
            lastPolling:
                devices.length > 0
                    ? devices.reduce((latest, current) =>
                        new Date(current.lastSeen) > new Date(latest.lastSeen)
                            ? current
                            : latest
                    ).lastSeen
                    : null
        };
    }

    async getDevice(id) {
    return prisma.device.findUnique({
        where: {
            id
        },
        include: {
            snapshot: true
        }
    });
}
}

export default new DashboardService();