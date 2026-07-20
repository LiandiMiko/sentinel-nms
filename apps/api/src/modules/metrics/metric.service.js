import snmp from "net-snmp";
import { OID } from "../../core/snmp/oid.js";
import { createSession } from "../../core/snmp/session.js";
import deviceRepository from "../devices/device.repository.js";
import metricRepository from "./metric.repository.js";

const POLLED_OIDS = [
    {
        oid: OID.sysName,
        name: "hostname"
    },
    {
        oid: OID.sysUpTime,
        name: "uptime"
    },
    {
        oid: OID.cpuLoad,
        name: "cpu"
    }
];

const normalizeValue = (value) => {
    if (Buffer.isBuffer(value)) {
        return value.toString();
    }

    return String(value);
};

class MetricService {
    async pollDevice(device) {
        const varbinds = await this.getVarbinds(device);
        const metrics = [];

        for (const [index, varbind] of varbinds.entries()) {
            if (snmp.isVarbindError(varbind)) {
                throw new Error(snmp.varbindError(varbind));
            }

            const metricDefinition = POLLED_OIDS[index];
            const metric = await metricRepository.create({
                deviceId: device.id,
                oid: metricDefinition.oid,
                name: metricDefinition.name,
                value: normalizeValue(varbind.value)
            });

            metrics.push(metric);
        }
            console.log("Calling updateLastSeen...");
            await deviceRepository.updateLastSeen(device.id);
            console.log("updateLastSeen finished");

        return {
            deviceId: device.id,
            deviceName: device.name,
            ipAddress: device.ipAddress,
            status: "up",
            metrics
        };
    }

    async getVarbinds(device) {
        return new Promise((resolve, reject) => {
            const session = createSession(
                device.ipAddress,
                device.community,
                device.snmpPort
            );

            console.log(POLLED_OIDS);
            console.log(POLLED_OIDS.map(metric => metric.oid));

            session.get(POLLED_OIDS.map((metric) => metric.oid), (err, varbinds) => {
                session.close();

                if (err) {
                    reject(err);
                    return;
                }

                resolve(varbinds);
            });
        });
    }

    async pollAll() {
        const devices = await deviceRepository.findEnabled();
        const results = [];

        for (const device of devices) {
            try {
                const result = await this.pollDevice(device);
                results.push(result);
            } catch (err) {
                results.push({
                    deviceId: device.id,
                    deviceName: device.name,
                    ipAddress: device.ipAddress,
                    status: "down",
                    error: err.message
                });
            }
        }

        return {
            total: devices.length,
            up: results.filter((result) => result.status === "up").length,
            down: results.filter((result) => result.status === "down").length,
            results
        };
    }

    async getHistory(deviceId, metricName, limit = 100) {
        const history = await metricRepository.findHistory(
            deviceId,
            metricName,
            Number(limit)
        );

        return history.reverse();
    }
}

export default new MetricService();