import deviceRepository from "../devices/device.repository.js";
import prisma from "../../core/database/prisma.js";
import operationsHealthService from "./operations-health.service.js";

class DashboardService {
    async devices(filters) {
        const devices = await deviceRepository.findAllWithMetrics(filters);

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
        const groupMap = new Map();

        const touchGroup = (id, name) => {
            if (!groupMap.has(id)) {
                groupMap.set(id, {
                    id,
                    name,
                    total: 0,
                    up: 0,
                    down: 0,
                    disabled: 0
                });
            }
            return groupMap.get(id);
        };

        for (const device of devices) {
            const targets = device.groups.length
                ? device.groups
                : [{ id: "__ungrouped__", name: "Ungrouped" }];
            for (const group of targets) {
                const bucket = touchGroup(group.id, group.name);
                bucket.total += 1;
                if (device.status === "UP") bucket.up += 1;
                else if (device.status === "DISABLED") bucket.disabled += 1;
                else bucket.down += 1;
            }
        }

        const groups = [...groupMap.values()].sort((left, right) => {
            if (left.id === "__ungrouped__") return 1;
            if (right.id === "__ungrouped__") return -1;
            return left.name.localeCompare(right.name);
        });

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
            }, null),
            groups
        };
    }

    async operationsHealth() {
        return operationsHealthService.get();
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
