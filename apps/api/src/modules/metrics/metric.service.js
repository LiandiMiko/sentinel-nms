import snmp from "net-snmp";
import { OID } from "../../core/snmp/oid.js";
import { createSession } from "../../core/snmp/session.js";
import deviceRepository from "../devices/device.repository.js";
import metricRepository from "./metric.repository.js";
import deviceEventRepository from "./device-event.repository.js";
import alertService from "../alerts/alert.service.js";

const LEGACY_INTERFACE_COUNTERS = {
    in: "1.3.6.1.2.1.2.2.1.10",
    out: "1.3.6.1.2.1.2.2.1.16"
};

export const normalizeValue = (value, oid) => {
    if (!Buffer.isBuffer(value)) return String(value);
    if ((oid === OID.ifPhysAddress || oid?.startsWith(`${OID.ifPhysAddress}.`)) && value.length === 6) {
        return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join(":");
    }
    if ((oid === OID.ipAdEntAddr || oid?.startsWith(`${OID.ipAdEntAddr}.`)) && value.length === 4) {
        return [...value].join(".");
    }
    if ([OID.ifInOctets, OID.ifOutOctets].some((base) => oid === base || oid?.startsWith(`${base}.`))) {
        if (value.length > 8) throw new Error(`Invalid 64-bit SNMP traffic counter length for OID ${oid}.`);
        return [...value].reduce((counter, byte) => (counter << 8n) | BigInt(byte), 0n).toString();
    }
    return value.toString();
};

const STANDARD_INTERFACE_FIELDS = [
    ["type", OID.ifType],
    ["mtu", OID.ifMtu],
    ["speed", OID.ifSpeed],
    ["mac", OID.ifPhysAddress],
    ["adminStatus", OID.ifAdminStatus],
    ["status", OID.ifOperStatus],
    ["inPackets", OID.ifInUcastPkts],
    ["inDiscards", OID.ifInDiscards],
    ["inErrors", OID.ifInErrors],
    ["outPackets", OID.ifOutUcastPkts],
    ["outDiscards", OID.ifOutDiscards],
    ["outErrors", OID.ifOutErrors]
];

const HIGH_CAPACITY_INTERFACE_FIELDS = [
    ["ifName", OID.ifName],
    ["highSpeed", OID.ifHighSpeed],
    ["inOctets", OID.ifInOctets],
    ["outOctets", OID.ifOutOctets],
    ["alias", OID.ifAlias]
];
const INTERFACE_FIELDS = [...STANDARD_INTERFACE_FIELDS, ...HIGH_CAPACITY_INTERFACE_FIELDS];

const makeMetric = (deviceId, oid, name, value, unit) => ({
    deviceId,
    oid,
    name,
    value: normalizeValue(value, oid),
    ...(unit ? { unit } : {})
});

async function mapWithConcurrency(items, limit, mapItem) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapItem(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

class MetricService {
    pollingPromise = null;

    async pollDevice(device) {
        const session = this.createDeviceSession(device);
        try {
            const required = await this.getSessionValues(session, [OID.sysName, OID.sysUpTime]);
            if (required.some((value) => value === null)) {
                throw new Error("SNMP system name or uptime is unavailable");
            }
            const metrics = [
                makeMetric(device.id, OID.sysName, "hostname", required[0]),
                makeMetric(device.id, OID.sysUpTime, "uptime", required[1], "hundredths"),
                ...await this.pollSystemDetails(session, device.id)
            ];
            const interfaces = await this.pollInterfaces(session, device.id);
            const interfaceMetrics = interfaces.flatMap(({ metrics: fields }) => fields);
            const now = new Date();
            const previousStatuses = await metricRepository.findLatestInterfaceStatuses(device.id);
            await metricRepository.createMany([...metrics, ...interfaceMetrics]);
            await this.recordInterfaceEvents(device.id, interfaceMetrics, now, previousStatuses);
            if (device.status === "down") {
                await deviceEventRepository.resolve({
                    deviceId: device.id,
                    type: "device-outage",
                    subject: device.name,
                    resolvedAt: now
                });
            }
            const snapshot = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
            const lastSeen = now;
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
        } finally {
            session.close();
        }
    }

    createDeviceSession(device) {
        return createSession(
            device.ipAddress,
            device.community,
            device.snmpPort,
            device.snmpVersion,
            device
        );
    }

    async pollSystemDetails(session, deviceId) {
        const scalarFields = [
            ["description", OID.sysDescr],
            ["contact", OID.sysContact],
            ["location", OID.sysLocation],
            ["objectId", OID.sysObjectID],
            ["services", OID.sysServices],
            ["mikrotikCpu", OID.cpuLoad]
        ];
        const scalarMetrics = await Promise.all(scalarFields.map(async ([name, oid]) => {
            const value = await this.getOptionalValue(session, oid);
            if (value === null || value === "") return null;
            return makeMetric(
                deviceId,
                oid,
                name === "mikrotikCpu" ? "cpu" : name,
                name === "mikrotikCpu" ? Number(value) : value,
                name === "mikrotikCpu" ? "tenths-percent" : undefined
            );
        }));
        const metrics = scalarMetrics.filter(Boolean);
        const processors = await this.walkColumn(session, OID.hrProcessorLoad);
        const processorLoads = processors
            .map(({ index, value }) => ({ index, load: Number(value) }))
            .filter(({ load }) => Number.isFinite(load));
        for (const { index, load } of processorLoads) {
            metrics.push(makeMetric(
                deviceId,
                `${OID.hrProcessorLoad}.${index}`,
                `cpu.core.${index}`,
                Math.round(load * 10),
                "tenths-percent"
            ));
        }
        if (!metrics.some(({ name }) => name === "cpu") && processorLoads.length) {
            const average = processorLoads.reduce((sum, { load }) => sum + load, 0) / processorLoads.length;
            metrics.push(makeMetric(
                deviceId,
                OID.hrProcessorLoad,
                "cpu",
                Math.round(average * 10),
                "tenths-percent"
            ));
        }
        metrics.push(...await this.pollStorage(session, deviceId));
        metrics.push(...await this.pollPhysicalInventory(session, deviceId));
        return metrics;
    }

    async recordInterfaceEvents(deviceId, currentMetrics, checkedAt, previousMetrics) {
        const previous = new Map();
        for (const metric of previousMetrics) {
            const match = metric.name.match(/^interface\.(\d+)\.status$/);
            if (match && !previous.has(match[1])) previous.set(match[1], metric.value);
        }
        const current = new Map();
        for (const metric of currentMetrics) {
            const match = metric.name.match(/^interface\.(\d+)\.(name|status)$/);
            if (!match) continue;
            const [, index, field] = match;
            if (!current.has(index)) current.set(index, {});
            current.get(index)[field] = metric.value;
        }

        await Promise.all([...current].map(async ([index, fields]) => {
            if (fields.status === undefined) return;
            const wasDown = ["2", "6", "7"].includes(previous.get(index));
            const isDown = ["2", "6", "7"].includes(fields.status);
            const subject = fields.name ?? `Interface ${index}`;
            if (isDown && (!previous.has(index) || !wasDown)) {
                await deviceEventRepository.start({
                    deviceId,
                    type: "interface-outage",
                    subject,
                    message: `${subject} changed to ${fields.status === "7" ? "lower layer down" : "down"}`,
                    startedAt: checkedAt
                });
            } else if (fields.status === "1" && wasDown) {
                const oldMetric = previousMetrics.find((metric) => metric.name === `interface.${index}.name`);
                await deviceEventRepository.resolve({
                    deviceId,
                    type: "interface-outage",
                    subject: oldMetric?.value ?? subject,
                    resolvedAt: checkedAt
                });
            }
        }));
    }

        async pollStorage(session, deviceId) {
        const [descriptions, units, sizes, used] = await Promise.all([
            this.walkColumn(session, OID.hrStorageDescr),
            this.walkColumn(session, OID.hrStorageAllocationUnits),
            this.walkColumn(session, OID.hrStorageSize),
            this.walkColumn(session, OID.hrStorageUsed)
        ]);
        const map = (entries) => new Map(entries.map(({ index, value }) => [index, value]));
        const descriptionMap = map(descriptions);
        const unitMap = map(units);
        const sizeMap = map(sizes);
        const usedMap = map(used);

        // SNMP Gauge32 can arrive signed; normalize to unsigned 32-bit.
        const asUnsigned32 = (value) => {
            const number = Number(value);
            if (!Number.isFinite(number)) return null;
            if (number < 0) return number + 0x100000000;
            return number;
        };

        const scoreMemoryDescription = (description) => {
            const text = String(description || "");
            if (/virtual|swap|cached|buffers|flash|disk|diskette|cdrom|usb|tmpfs|overlay/i.test(text)) {
                return -1;
            }
            if (/physical\s*memory|real\s*memory|main\s*memory/i.test(text)) return 100;
            if (/(^|[^a-z])ram([^a-z]|$)/i.test(text)) return 80;
            // Generic "memory" last — avoids wrong first-match on MikroTik labels.
            if (/memory/i.test(text)) return 20;
            return -1;
        };

        const storageRows = [];
        for (const [index, description] of descriptionMap) {
            const allocationUnit = asUnsigned32(unitMap.get(index));
            const totalUnits = asUnsigned32(sizeMap.get(index));
            const usedUnits = asUnsigned32(usedMap.get(index));
            if (allocationUnit == null || totalUnits == null || usedUnits == null) continue;
            if (allocationUnit <= 0 || totalUnits < 0 || usedUnits < 0) continue;

            const totalBytes = allocationUnit * totalUnits;
            const usedBytes = Math.min(allocationUnit * usedUnits, totalBytes);
            const usedPercent = totalBytes
                ? Math.min(100, Math.max(0, (usedBytes / totalBytes) * 100))
                : 0;

            storageRows.push({
                index,
                description: String(description ?? ""),
                allocationUnit,
                totalBytes,
                usedBytes,
                usedPercent,
                memoryScore: scoreMemoryDescription(description)
            });
        }

        // Prefer highest-scoring memory row with at least 1 MB capacity.
        const memoryCandidates = storageRows
            .filter((row) => row.memoryScore > 0 && row.totalBytes >= 1024 * 1024)
            .sort((left, right) => {
                if (right.memoryScore !== left.memoryScore) return right.memoryScore - left.memoryScore;
                return right.totalBytes - left.totalBytes;
            });
        const memoryRow = memoryCandidates[0] ?? null;

        const metrics = [];
        if (memoryRow) {
            metrics.push(
                makeMetric(deviceId, `${OID.hrStorageSize}.${memoryRow.index}`, "memory.totalBytes", memoryRow.totalBytes, "bytes"),
                makeMetric(deviceId, `${OID.hrStorageUsed}.${memoryRow.index}`, "memory.usedBytes", memoryRow.usedBytes, "bytes"),
                makeMetric(deviceId, `${OID.hrStorageSize}.${memoryRow.index}`, "memory.freeBytes", Math.max(0, memoryRow.totalBytes - memoryRow.usedBytes), "bytes"),
                makeMetric(deviceId, `${OID.hrStorageUsed}.${memoryRow.index}`, "memory.usedPercent", memoryRow.usedPercent, "percent")
            );
        }

        for (const row of storageRows) {
            if (memoryRow && row.index === memoryRow.index) continue;
            if (/virtual|swap/i.test(row.description)) continue;
            metrics.push(
                makeMetric(deviceId, `${OID.hrStorageDescr}.${row.index}`, `storage.${row.index}.name`, row.description),
                makeMetric(deviceId, `${OID.hrStorageSize}.${row.index}`, `storage.${row.index}.totalBytes`, row.totalBytes, "bytes"),
                makeMetric(deviceId, `${OID.hrStorageUsed}.${row.index}`, `storage.${row.index}.usedBytes`, row.usedBytes, "bytes"),
                makeMetric(deviceId, `${OID.hrStorageUsed}.${row.index}`, `storage.${row.index}.usedPercent`, row.usedPercent, "percent")
            );
        }
        return metrics;
    }


    async pollPhysicalInventory(session, deviceId) {
        const physicalFields = [
            ["description", OID.entPhysicalDescr],
            ["vendor", OID.entPhysicalVendor],
            ["name", OID.entPhysicalName],
            ["hardwareRevision", OID.entPhysicalHardwareRev],
            ["firmwareRevision", OID.entPhysicalFirmwareRev],
            ["softwareRevision", OID.entPhysicalSoftwareRev],
            ["serialNumber", OID.entPhysicalSerial],
            ["model", OID.entPhysicalModel]
        ];
        const physicalValues = await Promise.all(physicalFields.map(([, oid]) => this.walkColumn(session, oid)));
        const physical = new Map();
        for (const [position, [field, oid]] of physicalFields.entries()) {
            for (const { index, value } of physicalValues[position]) {
                if (!value || (field === "vendor" && value === "0.0")) continue;
                if (!physical.has(index)) physical.set(index, {});
                physical.get(index)[field] = value;
                physical.get(index)[`${field}Oid`] = oid;
            }
        }
        const metrics = [];
        for (const [index, fields] of physical) {
            for (const [field, value] of Object.entries(fields)) {
                if (field.endsWith("Oid")) continue;
                metrics.push(makeMetric(
                    deviceId,
                    fields[`${field}Oid`],
                    `hardware.${index}.${field}`,
                    value
                ));
            }
        }

        const sensorFields = [
            ["type", OID.entSensorType],
            ["scale", OID.entSensorScale],
            ["precision", OID.entSensorPrecision],
            ["value", OID.entSensorValue],
            ["status", OID.entSensorStatus],
            ["unit", OID.entSensorUnits]
        ];
        const sensorValues = await Promise.all(sensorFields.map(([, oid]) => this.walkColumn(session, oid)));
        const sensors = new Map();
        for (const [position, [field]] of sensorFields.entries()) {
            for (const { index, value } of sensorValues[position]) {
                if (!sensors.has(index)) sensors.set(index, {});
                sensors.get(index)[field] = value;
            }
        }
        const sensorUnits = {
            3: "V AC", 4: "V DC", 5: "A", 6: "W", 7: "Hz",
            8: "°C", 9: "% RH", 10: "RPM", 11: "CMM", 12: "state", 14: "dBm"
        };
        const scaleExponents = [-24, -21, -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 18];
        for (const [index, sensor] of sensors) {
            const rawValue = Number(sensor.value);
            const scale = Number(sensor.scale);
            const precision = Number(sensor.precision);
            const scaleExponent = scaleExponents[scale - 1];
            if (!Number.isFinite(rawValue) || scaleExponent === undefined || !Number.isFinite(precision)) continue;
            const value = rawValue * (10 ** (scaleExponent - precision));
            const unit = sensorUnits[Number(sensor.type)] ?? "sensor units";
            const name = physical.get(index)?.name ?? physical.get(index)?.description ?? `Sensor ${index}`;
            const status = sensor.status ?? "unknown";
            metrics.push(
                makeMetric(deviceId, `${OID.entSensorValue}.${index}`, `sensor.${index}.name`, name),
                makeMetric(deviceId, `${OID.entSensorValue}.${index}`, `sensor.${index}.value`, value, unit),
                makeMetric(deviceId, `${OID.entSensorStatus}.${index}`, `sensor.${index}.status`, status),
                makeMetric(deviceId, `${OID.entSensorType}.${index}`, `sensor.${index}.type`, sensor.type)
            );
        }
        return metrics;
    }

    async pollInterfaces(session, deviceId) {
        const descriptions = await this.walkColumn(session, OID.ifDescr, true);
        const addresses = await this.pollIpv4Addresses(session);
        return mapWithConcurrency(descriptions, 16, async ({ index, value: description }) => {
            const [standardValues, highCapacityValues] = await Promise.all([
                this.getOptionalValues(
                    session,
                    STANDARD_INTERFACE_FIELDS.map(([, oid]) => `${oid}.${index}`)
                ),
                this.getOptionalValues(
                    session,
                    HIGH_CAPACITY_INTERFACE_FIELDS.map(([, oid]) => `${oid}.${index}`)
                )
            ]);
            const fields = Object.fromEntries([
                ...STANDARD_INTERFACE_FIELDS.map(([name], position) => [name, standardValues[position]]),
                ...HIGH_CAPACITY_INTERFACE_FIELDS.map(([name], position) => [name, highCapacityValues[position]])
            ]);
            let inOid = OID.ifInOctets;
            let outOid = OID.ifOutOctets;
            let hasCounters = fields.inOctets !== null && fields.outOctets !== null;
            if (fields.inOctets === null || fields.outOctets === null) {
                const legacy = await this.getOptionalValues(session, [
                    `${LEGACY_INTERFACE_COUNTERS.in}.${index}`,
                    `${LEGACY_INTERFACE_COUNTERS.out}.${index}`
                ]);
                if (legacy[0] !== null && legacy[1] !== null) {
                    fields.inOctets = legacy[0];
                    fields.outOctets = legacy[1];
                    inOid = LEGACY_INTERFACE_COUNTERS.in;
                    outOid = LEGACY_INTERFACE_COUNTERS.out;
                    hasCounters = true;
                } else {
                    hasCounters = false;
                }
            }
            const name = fields.ifName || description;
            const result = [makeMetric(deviceId, `${OID.ifDescr}.${index}`, `interface.${index}.name`, name)];
            if (hasCounters) {
                result.push(
                    makeMetric(deviceId, `${inOid}.${index}`, `interface.${index}.inOctets`, fields.inOctets, "octets"),
                    makeMetric(deviceId, `${outOid}.${index}`, `interface.${index}.outOctets`, fields.outOctets, "octets")
                );
            }
            for (const [field, oid] of INTERFACE_FIELDS) {
                const value = fields[field];
                if (value === null || value === undefined || value === "") continue;
                if (field === "inOctets" || field === "outOctets") continue;
                if (field === "highSpeed") continue;
                if (field === "speed" && Number(fields.highSpeed) > 0) continue;
                result.push(makeMetric(
                    deviceId,
                    `${oid}.${index}`,
                    `interface.${index}.${field === "speed" ? "speed" : field}`,
                    value,
                    field === "speed" ? "bits-per-second" : undefined
                ));
            }
            const interfaceAddresses = addresses.get(index);
            if (interfaceAddresses?.length) {
                result.push(makeMetric(
                    deviceId,
                    `${OID.ipAdEntAddr}.${index}`,
                    `interface.${index}.addresses`,
                    interfaceAddresses.join(", ")
                ));
            }
            if (fields.highSpeed !== null && Number(fields.highSpeed) > 0) {
                result.push(makeMetric(
                    deviceId,
                    `${OID.ifHighSpeed}.${index}`,
                    `interface.${index}.speed`,
                    Number(fields.highSpeed) * 1_000_000,
                    "bits-per-second"
                ));
            }
            return { index, metrics: result };
        });
    }

    async pollIpv4Addresses(session) {
        const [addressEntries, indexEntries] = await Promise.all([
            this.walkColumn(session, OID.ipAdEntAddr),
            this.walkColumn(session, OID.ipAdEntIfIndex)
        ]);
        const indexes = new Map(indexEntries.map(({ index, value }) => [index, value]));
        const addresses = new Map();
        for (const { index, value } of addressEntries) {
            const interfaceIndex = indexes.get(index);
            if (interfaceIndex === undefined) continue;
            if (!addresses.has(interfaceIndex)) addresses.set(interfaceIndex, []);
            addresses.get(interfaceIndex).push(value);
        }
        return addresses;
    }

    async getOptionalValue(session, oid) {
        return (await this.getOptionalValues(session, [oid]))[0];
    }

    async getOptionalValues(session, oids) {
        try {
            return await this.getSessionValues(session, oids);
        } catch {
            return oids.map(() => null);
        }
    }

    walkColumn(session, oid, required = false) {
        return new Promise((resolve, reject) => {
            const found = [];
            session.subtree(
                oid,
                (varbinds) => {
                    for (const varbind of varbinds) {
                        if (snmp.isVarbindError(varbind)) {
                            if (required) reject(new Error(snmp.varbindError(varbind)));
                            return true;
                        }
                        found.push({
                            index: varbind.oid.slice(oid.length + 1),
                            value: normalizeValue(varbind.value, varbind.oid)
                        });
                    }
                    return false;
                },
                (error) => {
                    if (error && required) reject(error);
                    else resolve(found);
                }
            );
        });
    }

    getSessionValues(session, oids) {
        return new Promise((resolve, reject) => {
            session.get(oids, (error, varbinds) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(varbinds.map((varbind, index) => (
                    snmp.isVarbindError(varbind) ? null : normalizeValue(varbind.value, oids[index])
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
                    if (device.status !== "down") {
                        await deviceEventRepository.start({
                            deviceId: device.id,
                            type: "device-outage",
                            subject: device.name,
                            message: err.message,
                            startedAt: new Date()
                        });
                    }
                    await deviceRepository.markDown(device.id, err.message);
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
        await alertService.evaluate(results);
        return {
            total: devices.length,
            up: results.filter((result) => result.status === "up").length,
            down: results.filter((result) => result.status === "down").length,
            results
        };
    }

    async getHistory(deviceId, metricName, limit = 100, rangeSeconds = null) {
        if (rangeSeconds !== null) {
            const parsedRange = Number(rangeSeconds);
            const minimumRange = 5 * 60;
            const maximumRange = 180 * 24 * 60 * 60;
            if (!Number.isInteger(parsedRange) || parsedRange < minimumRange || parsedRange > maximumRange) {
                const error = new Error("Range must be between 5 minutes and 180 days");
                error.status = 400;
                throw error;
            }
            return metricRepository.findHistoryWindow(deviceId, metricName, parsedRange, 1000);
        }
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
            const match = metric.name.match(/^interface\.(\d+)\.(.+)$/);
            if (!match) continue;
            const [, index, field] = match;
            if (!interfaces.has(index)) interfaces.set(index, { index });
            const item = interfaces.get(index);
            if (item[field] === undefined) item[field] = metric.value;
        }

        return [...interfaces.values()];
    }

    async getSummary(deviceId) {
        if (!(await deviceRepository.findById(deviceId))) {
            const error = new Error("Device not found");
            error.status = 404;
            throw error;
        }
        const metrics = await metricRepository.findLatestSystemMetrics(deviceId);
        const latest = new Map();
        for (const item of metrics) {
            if (!latest.has(item.name)) latest.set(item.name, item);
        }
        const system = Object.fromEntries([...latest.entries()]
            .filter(([name]) => !name.startsWith("memory.")
                && !name.startsWith("storage.")
                && !name.startsWith("hardware.")
                && !name.startsWith("sensor.")
                && !name.startsWith("cpu.core."))
            .map(([name, item]) => [name, item.value]));
        const cpuCores = [...latest.entries()]
            .map(([name, item]) => {
                const match = name.match(/^cpu\.core\.(\d+)$/);
                return match ? { index: match[1], load: item.value } : null;
            })
            .filter(Boolean)
            .sort((left, right) => Number(left.index) - Number(right.index));
        const memory = Object.fromEntries([...latest.entries()]
            .filter(([name]) => name.startsWith("memory."))
            .map(([name, item]) => [name.slice("memory.".length), item.value]));
        const storage = new Map();
        for (const [name, item] of latest) {
            const match = name.match(/^storage\.(\d+)\.(.+)$/);
            if (!match) continue;
            const [, index, field] = match;
            if (!storage.has(index)) storage.set(index, { index });
            storage.get(index)[field] = item.value;
        }
        const groupMetrics = (prefix) => {
            const values = new Map();
            for (const [name, item] of latest) {
                const match = name.match(new RegExp(`^${prefix}\\.(\\d+)\\.(.+)$`));
                if (!match) continue;
                const [, index, field] = match;
                if (field === "vendor" && item.value === "0.0") continue;
                if (!values.has(index)) values.set(index, { index });
                values.get(index)[field] = item.value;
            }
            return [...values.values()];
        };
        return {
            system,
            cpuCores,
            memory: Object.keys(memory).length ? memory : null,
            storage: [...storage.values()],
            hardware: groupMetrics("hardware"),
            sensors: groupMetrics("sensor")
        };
    }

    async getEvents(deviceId) {
        if (!(await deviceRepository.findById(deviceId))) {
            const error = new Error("Device not found");
            error.status = 404;
            throw error;
        }
        return deviceEventRepository.findByDevice(deviceId);
    }
}

export default new MetricService();
