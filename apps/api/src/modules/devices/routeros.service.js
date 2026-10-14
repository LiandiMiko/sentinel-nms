import prisma from "../../core/database/prisma.js";
import { decryptDeviceSecret } from "../../core/utils/secret.js";

const MAX_QUEUE_ITEMS = 500;
const MAX_CONNECTION_ITEMS = 500;

function requireRouterOsCredentials(device) {
    if (!device.username || !device.password) {
        const error = new Error("Configure RouterOS username and password for this device first.");
        error.status = 400;
        throw error;
    }
}

class RouterOsService {
    async request(device, resource) {
        const credentials = Buffer.from(
            `${device.username}:${decryptDeviceSecret(device.password)}`,
            "utf8"
        ).toString("base64");
        let response;
        try {
            response = await fetch(
                `https://${device.ipAddress}:${device.routerOsPort}/rest/${resource}`,
                {
                    headers: { Authorization: `Basic ${credentials}` },
                    signal: AbortSignal.timeout(5000)
                }
            );
        } catch (cause) {
            const error = new Error(cause.name === "TimeoutError"
                ? "RouterOS HTTPS request timed out."
                : "Could not connect to the RouterOS HTTPS REST service.");
            error.status = cause.name === "TimeoutError" ? 504 : 502;
            throw error;
        }
        if (!response.ok) {
            const error = new Error(`RouterOS REST request failed with HTTP ${response.status}. Verify RouterOS v7 HTTPS REST access and read-only API permissions.`);
            error.status = 502;
            throw error;
        }
        return response.json();
    }

    async inspect(id) {
        const device = await prisma.device.findUnique({ where: { id } });
        if (!device) {
            const error = new Error("Device not found");
            error.status = 404;
            throw error;
        }
        requireRouterOsCredentials(device);

        const [identityResult, resourceResult, interfaceResult, queueResult, connectionResult] = await Promise.allSettled([
            this.request(device, "system/identity"),
            this.request(device, "system/resource"),
            this.request(device, "interface"),
            this.request(device, "queue/simple"),
            this.request(device, "ip/firewall/connection")
        ]);
        const getRequiredResult = (result) => {
            if (result.status === "rejected") throw result.reason;
            return result.value;
        };
        const identity = getRequiredResult(identityResult);
        const resources = getRequiredResult(resourceResult);
        const interfaces = getRequiredResult(interfaceResult);
        const optionalList = (result, limit) => {
            if (result.status === "rejected") {
                return { total: 0, truncated: false, items: [], error: result.reason.message };
            }
            return {
                total: result.value.length,
                truncated: result.value.length > limit,
                items: result.value.slice(0, limit),
                error: null
            };
        };
        const queueList = optionalList(queueResult, MAX_QUEUE_ITEMS);
        const connectionList = optionalList(connectionResult, MAX_CONNECTION_ITEMS);
        return {
            identity: identity.name ?? device.name,
            resource: {
                version: resources.version ?? null,
                uptime: resources.uptime ?? null,
                cpuLoad: resources["cpu-load"] ?? null,
                totalMemory: resources["total-memory"] ?? null,
                freeMemory: resources["free-memory"] ?? null
            },
            interfaces: interfaces.map((item) => ({
                name: item.name,
                type: item.type,
                running: item.running === "true" || item.running === true,
                disabled: item.disabled === "true" || item.disabled === true,
                rxBytes: item["rx-byte"] ?? null,
                txBytes: item["tx-byte"] ?? null
            })),
            queues: {
                ...queueList,
                items: queueList.items.map((item) => ({
                    name: item.name ?? null,
                    target: item.target ?? null,
                    parent: item.parent ?? null,
                    maxLimit: item["max-limit"] ?? null,
                    rate: item.rate ?? null,
                    bytes: item.bytes ?? null,
                    packets: item.packets ?? null,
                    queuedBytes: item["queued-bytes"] ?? null,
                    queuedPackets: item["queued-packets"] ?? null,
                    disabled: item.disabled === "true" || item.disabled === true,
                    dynamic: item.dynamic === "true" || item.dynamic === true
                }))
            },
            connections: {
                ...connectionList,
                items: connectionList.items.map((item) => ({
                    protocol: item.protocol ?? null,
                    source: item["src-address"] ?? null,
                    destination: item["dst-address"] ?? null,
                    tcpState: item["tcp-state"] ?? null,
                    state: item.state ?? null,
                    timeout: item.timeout ?? null,
                    connectionMark: item["connection-mark"] ?? null,
                    connectionType: item["connection-type"] ?? null,
                    originalBytes: item["orig-bytes"] ?? null,
                    replyBytes: item["repl-bytes"] ?? null,
                    originalPackets: item["orig-packets"] ?? null,
                    replyPackets: item["repl-packets"] ?? null
                }))
            },
            fetchedAt: new Date().toISOString()
        };
    }
}

export default new RouterOsService();
