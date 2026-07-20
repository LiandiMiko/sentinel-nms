import deviceRepository from "../devices/device.repository.js";
import metricRepository from "../metrics/metric.repository.js";

class DashboardService {
    async devices() {
        const devices = await deviceRepository.findAllWithMetrics();

        return devices.map((device) => {
            const lastSeen = device.lastSeen;

const now = Date.now();
const lastSeenTime = lastSeen
    ? new Date(lastSeen).getTime()
    : null;


const status =
    lastSeen &&
    now - lastSeenTime < 30000
        ? "UP"
        : "DOWN";

            return {
                id: device.id,
                name: device.name,
                ipAddress: device.ipAddress,
                status,
                lastSeen,
                metrics: device.metrics
            };
        });
    }

    async summary() {

    const [
        totalDevices,
        upDevices,
        downDevices,
        totalMetrics,
        latestMetric
    ] = await Promise.all([
        deviceRepository.countAll(),
        deviceRepository.countUp(),
        deviceRepository.countDown(),
        metricRepository.count(),
        metricRepository.latestMetric()
    ]);

    return {
        totalDevices,
        upDevices,
        downDevices,
        totalMetrics,
        lastPolling: latestMetric?.createdAt ?? null
    };
}
}

export default new DashboardService();