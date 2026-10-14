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

            const status = !device.enabled
                ? "DISABLED"
                : device.status === "up" && lastSeen && now - lastSeenTime < 90000
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
                snmpPort: device.snmpPort,
                snmpVersion: device.snmpVersion,
                snmpSecurityName: device.snmpSecurityName,
                snmpSecurityLevel: device.snmpSecurityLevel,
                snmpAuthProtocol: device.snmpAuthProtocol,
                snmpPrivProtocol: device.snmpPrivProtocol,
                routerOsPort: device.routerOsPort,
                username: device.username,
                enabled: device.enabled,
                status,
                lastSeen: lastSeen,
                metrics,
                groups: device.groups.map(({ group }) => group),
                tags: device.tags.map(({ tag }) => tag),
                lastError: device.lastError
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
            openAlerts: await prisma.alert.count({
                where: { state: { in: ["open", "acknowledged"] } }
            }),
            lastPolling: devices.reduce((latest, current) => {
                if (!current.lastSeen) return latest;
                return !latest || current.lastSeen > latest
                    ? current.lastSeen
                    : latest;
            }, null)
        };
    }

    async getDevice(id) {
        const device = await prisma.device.findUnique({
            where: { id },
            include: { snapshot: true }
        });
        if (!device) {
            const error = new Error("Device not found");
            error.status = 404;
            throw error;
        }
        const {
            community,
            password,
            snmpAuthPassword,
            snmpPrivPassword,
            ...safeDevice
        } = device;
        return safeDevice;
    }
}

export default new DashboardService();