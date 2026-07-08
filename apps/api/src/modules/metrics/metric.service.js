import snmp from "net-snmp";
import deviceRepository from "../devices/device.repository.js";
import metricRepository from "./metric.repository.js";

const OIDS = {
    hostname: "1.3.6.1.2.1.1.5.0",
    uptime: "1.3.6.1.2.1.1.3.0"
};

class MetricService {

async pollDevice(device) {

    return new Promise((resolve, reject) => {

        const session = snmp.createSession(
            device.ipAddress,
            device.community,
            {
                port: device.snmpPort,
                timeout: 3000
            }
        );

        session.get(
            [OIDS.hostname, OIDS.uptime],
            async (err, varbinds) => {

                session.close();

                if (err) {
                    return reject(err);
                }

                const hostname = varbinds[0].value.toString();
const uptime = Number(varbinds[1].value);

// Simpan hostname
await metricRepository.create({
    deviceId: device.id,
    oid: OIDS.hostname,
    name: "hostname",
    value: hostname
});

// Simpan uptime
await metricRepository.create({
    deviceId: device.id,
    oid: OIDS.uptime,
    name: "uptime",
    value: uptime.toString()
});

resolve({
    hostname,
    uptime
});

            }
        );

    });

}

async pollAll() {

    const devices = await deviceRepository.findAll();

    const results = [];

    for (const device of devices) {

        const metric = await this.pollDevice(device);

        results.push(metric);

    }

    return results;

}
}

export default new MetricService();