import snmp from "net-snmp";
import { OID } from "../../core/snmp/oid.js";
import { createSession } from "../../core/snmp/session.js";
import deviceRepository from "../devices/device.repository.js";
import metricRepository from "./metric.repository.js";

const POLLED_OIDS = [
    { oid: OID.sysName, name: "hostname" },
    { oid: OID.sysUpTime, name: "uptime" },
    { oid: OID.cpuLoad, name: "cpu" }
];

const LEGACY_INTERFACE_COUNTERS = {
    in: "1.3.6.1.2.1.2.2.1.10",
    out: "1.3.6.1.2.1.2.2.1.16"
};

const normalizeValue = (value) => Buffer.isBuffer(value) ? value.toString() : String(value);

class MetricService {
    pollingPromise = null;

    async pollDevice(device) {
        const varbinds = await this.getVarbinds(device);
        const metrics = varbinds.map((varbind, index) => {
            if (snmp.isVarbindError(varbind)) {
                throw new Error(snmp.varbindError(varbind));
            }
            return {
                deviceId: device.id,
                oid: POLLED_OIDS[index].oid,
                name: POLLED_OIDS[index].name,
                value: normalizeValue(varbind.value)
            };
        });

        const interfaces = await this.pollInterfaces(device);
        const interfaceMetrics = interfaces.flatMap((item) => [
            {
                deviceId: device.id,
                oid: `${OID.ifDescr}.${item.index}`,
                name: `interface.${item.index}.name`,
                value: item.name
            },
            {
                deviceId: device.id,
                oid: `${item.inOid}.${item.index}`,
                name: `interface.${item.index}.inOctets`,
                value: item.inOctets,
                unit: "octets"
            },
            {
                deviceId: device.id,
                oid: `${item.outOid}.${item.index}`,
                name: `interface.${item.index}.outOctets`,
                value: item.outOctets,
                unit: "octets"
            },
            {
                deviceId: device.id,
                oid: `${OID.ifOperStatus}.${item.index}`,
                name: `interface.${item.index}.status`,
                value: item.status
            }
        ]);

        await metricRepository.createMany([...metrics, ...interfaceMetrics]);
        const snapshot = Object.fromEntries(
            metrics.map((metric) => [metric.name, metric.value])
        );
        const lastSeen = new Date();

        await metricRepository.upsertSnapshot({
            deviceId: device.id,
            hostname: snapshot.hostname,
            uptime: snapshot.uptime,
            cpu: snapshot.cpu,
            lastSeen
        });
        await deviceRepository.updateLastSeen(device.id);

        return {
            deviceId: device.id,
            deviceName: device.name,
            ipAddress: device.ipAddress,
            status: "up",
            metrics: metrics.length + interfaceMetrics.length,
            interfaces: interfaces.length
        };
    }

    async getVarbinds(device) {
        const session = createSession(
            device.ipAddress,
            device.community,
            device.snmpPort,
            device.snmpVersion
        );
        return new Promise((resolve, reject) => {
            session.get(POLLED_OIDS.map(({ oid }) => oid), (err, varbinds) => {
                session.close();
                if (err) {
                    reject(err);
                    return;
                }
                resolve(varbinds);
            });
        });
    }

    async pollInterfaces(device) {
        const session = createSession(
            device.ipAddress,
            device.community,
            device.snmpPort,
            device.snmpVersion
        );

        try {
            const descriptions = await new Promise((resolve, reject) => {
                const found = [];
                session.subtree(
                    OID.ifDescr,
                    (varbinds) => {
                        for (const varbind of varbinds) {
                            if (snmp.isVarbindError(varbind)) {
                                reject(new Error(snmp.varbindError(varbind)));
                                return true;
                            }
                            const index = varbind.oid.slice(OID.ifDescr.length + 1);
                            found.push({ index, name: normalizeValue(varbind.value) });
                        }
                        return false;
                    },
                    (error) => error ? reject(error) : resolve(found)
                );
            });

            return await Promise.all(descriptions.map(async ({ index, name }) => {
                const highCapacityOids = [
                    `${OID.ifInOctets}.${index}`,
                    `${OID.ifOutOctets}.${index}`,
                    `${OID.ifOperStatus}.${index}`
                ];
                const highCapacityValues = await this.getSessionValues(session, highCapacityOids);
                let values = highCapacityValues;
                let inOid = OID.ifInOctets;
                let outOid = OID.ifOutOctets;

                if (highCapacityValues.slice(0, 2).some((value) => value === null)) {
                    const legacyValues = await this.getSessionValues(session, [
                        `${LEGACY_INTERFACE_COUNTERS.in}.${index}`,
                        `${LEGACY_INTERFACE_COUNTERS.out}.${index}`,
                        `${OID.ifOperStatus}.${index}`
                    ]);
                    values = legacyValues;
                    inOid = LEGACY_INTERFACE_COUNTERS.in;
                    outOid = LEGACY_INTERFACE_COUNTERS.out;
                }

                if (values.some((value) => value === null)) {
                    throw new Error(`SNMP interface counters unavailable for ${name}`);
                }
                return { index, name, inOctets: values[0], outOctets: values[1], status: values[2], inOid, outOid };
            }));
        } finally {
            session.close();
        }
    }

    getSessionValues(session, oids) {
        return new Promise((resolve, reject) => {
            session.get(oids, (error, varbinds) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(varbinds.map((varbind) => (
                    snmp.isVarbindError(varbind) ? null : normalizeValue(varbind.value)
                )));
            });
        });
    }

    async pollAll() {
        if (this.pollingPromise) return this.pollingPromise;
        this.pollingPromise = this.runPollAll();
        try {
            return await this.pollingPromise;
        } finally {
            this.pollingPromise = null;
        }
    }

    async runPollAll() {
        const devices = await deviceRepository.findEnabled();
        const results = new Array(devices.length);
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < devices.length) {
                const index = nextIndex++;
                const device = devices[index];
                try {
                    results[index] = await this.pollDevice(device);
                } catch (err) {
                    results[index] = {
                        deviceId: device.id,
                        deviceName: device.name,
                        ipAddress: device.ipAddress,
                        status: "down",
                        error: err.message
                    };
                }
            }
        };

        await Promise.all(
            Array.from({ length: Math.min(25, devices.length) }, () => worker())
        );
        return {
            total: devices.length,
            up: results.filter((result) => result.status === "up").length,
            down: results.filter((result) => result.status === "down").length,
            results
        };
    }

    async getHistory(deviceId, metricName, limit = 100) {
        const parsedLimit = Number(limit);
        if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
            const error = new Error("Limit must be an integer between 1 and 1000");
            error.status = 400;
            throw error;
        }
        const history = await metricRepository.findHistory(deviceId, metricName, parsedLimit);
        return history.reverse();
    }

    async getInterfaces(deviceId) {
        const metrics = await metricRepository.findLatestInterfaceMetrics(deviceId);
        const interfaces = new Map();

        for (const metric of metrics) {
            const match = metric.name.match(/^interface\.(\d+)\.(name|inOctets|outOctets|status)$/);
            if (!match) continue;
            const [, index, field] = match;
            if (!interfaces.has(index)) interfaces.set(index, { index });
            const item = interfaces.get(index);
            if (item[field] === undefined) item[field] = metric.value;
        }

        return [...interfaces.values()];
    }
}

export default new MetricService();
