import deviceRepository from "../devices/device.repository.js";

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
}

export default new DashboardService();