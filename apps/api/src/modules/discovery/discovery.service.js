import snmp from "net-snmp";
import { createSession } from "../../core/snmp/session.js";

function ipv4ToInteger(address) {
    return address.split(".").reduce((value, octet) => (value * 256) + Number(octet), 0);
}

function integerToIpv4(value) {
    return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function isPrivateIpv4(value) {
    const first = value >>> 24;
    const second = (value >>> 16) & 255;
    return first === 10
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168);
}

function inputError(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

export function parseDiscoveryTargets(cidr) {
    const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(cidr);
    if (!match || match[1].split(".").some((octet) => Number(octet) > 255)) {
        throw inputError("Enter a valid private IPv4 CIDR range.");
    }
    const prefix = Number(match[2]);
    if (prefix < 24 || prefix > 32) {
        throw inputError("Discovery is limited to networks of at most 256 addresses (/24 or smaller).");
    }

    const address = ipv4ToInteger(match[1]);
    const size = 2 ** (32 - prefix);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    const network = (address & mask) >>> 0;
    if (network !== address || !isPrivateIpv4(network) || !isPrivateIpv4((network + size - 1) >>> 0)) {
        throw inputError("Discovery is only allowed for canonical RFC1918 private IPv4 ranges.");
    }

    const first = size > 2 ? network + 1 : network;
    const last = size > 2 ? network + size - 2 : network + size - 1;
    return Array.from({ length: last - first + 1 }, (_, index) => integerToIpv4(first + index));
}

function getSystemName(ipAddress, community, port, version) {
    const session = createSession(ipAddress, community, port, version, {}, { timeout: 900, retries: 0 });
    return new Promise((resolve, reject) => {
        session.get(["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.1.0"], (error, varbinds) => {
            session.close();
            if (error) {
                reject(error);
                return;
            }
            if (!varbinds?.length || varbinds.some((item) => snmp.isVarbindError(item))) {
                reject(new Error("SNMP system information is unavailable"));
                return;
            }
            resolve({
                hostname: Buffer.isBuffer(varbinds[0].value) ? varbinds[0].value.toString() : String(varbinds[0].value),
                description: Buffer.isBuffer(varbinds[1].value) ? varbinds[1].value.toString() : String(varbinds[1].value)
            });
        });
    });
}

class DiscoveryService {
    async scan({ cidr, community, port, version }) {
        const targets = parseDiscoveryTargets(cidr);
        const results = [];
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < targets.length) {
                const ipAddress = targets[nextIndex++];
                try {
                    const system = await getSystemName(ipAddress, community, port, version);
                    results.push({ ipAddress, ...system });
                } catch {
                    // A timeout or missing SNMP response means the address was not discovered.
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(24, targets.length) }, worker));
        return results.sort((left, right) => ipv4ToInteger(left.ipAddress) - ipv4ToInteger(right.ipAddress));
    }
}

export default new DiscoveryService();
