import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
const HOST_REGEX = /^[a-zA-Z0-9.-]+$/;

export function isValidTarget(target) {
    if (typeof target !== "string") return false;
    const trimmed = target.trim();
    if (!trimmed || trimmed.length > 255) return false;
    if (trimmed.includes(" ") || trimmed.includes(";") || trimmed.includes("&") || trimmed.includes("|")) {
        return false;
    }
    return IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed) || HOST_REGEX.test(trimmed);
}

export function parsePingOutput(output) {
    if (!output || typeof output !== "string") {
        return { alive: false, packetLoss: 100, latency: null };
    }

    let packetLoss = 100;
    let latency = null;

    // 1. Packet Loss extraction
    const lossMatch = output.match(/(\d+)%\s*(?:packet\s*)?loss/i);
    if (lossMatch) {
        packetLoss = Number(lossMatch[1]);
    } else {
        const winPackets = output.match(/Sent\s*=\s*(\d+),\s*Received\s*=\s*(\d+)/i);
        const linPackets = output.match(/(\d+)\s*(?:packets\s+)?transmitted,\s*(\d+)\s*(?:packets\s+)?received/i);
        if (winPackets) {
            const sent = Number(winPackets[1]);
            const recv = Number(winPackets[2]);
            packetLoss = sent > 0 ? Math.round(((sent - recv) / sent) * 100) : 100;
        } else if (linPackets) {
            const sent = Number(linPackets[1]);
            const recv = Number(linPackets[2]);
            packetLoss = sent > 0 ? Math.round(((sent - recv) / sent) * 100) : 100;
        }
    }

    // 2. Latency extraction
    // Windows: Average = 2ms
    const winAvgMatch = output.match(/Average\s*=\s*(\d+)ms/i);
    // Linux: rtt min/avg/max/mdev = 0.038/0.039/0.041/0.002 ms or round-trip min/avg/max = ...
    const linAvgMatch = output.match(/(?:rtt|round-trip)\s*min\/avg\/max(?:[/\w]+)?\s*=\s*[\d.]+\/([\d.]+)\//i);

    if (winAvgMatch) {
        latency = Number(winAvgMatch[1]);
    } else if (linAvgMatch) {
        latency = Number(linAvgMatch[1]);
    } else {
        // Fallback: search individual reply times (time=Xms or time<1ms)
        const times = [];
        const timeRegex = /time[=<]([\d.]+)\s*ms/gi;
        let match;
        while ((match = timeRegex.exec(output)) !== null) {
            times.push(Number(match[1]));
        }
        if (times.length > 0) {
            const sum = times.reduce((a, b) => a + b, 0);
            latency = Math.round((sum / times.length) * 10) / 10;
        }
    }

    // Treat destination host unreachable as down if 100% loss or no valid reply
    if (/Destination host unreachable/i.test(output) && latency === null) {
        packetLoss = 100;
    }

    const alive = packetLoss < 100 && latency !== null;

    return {
        alive,
        packetLoss,
        latency: latency !== null ? Math.round(latency * 10) / 10 : null
    };
}

export function getPingCommand(ipAddress, { count = 2, timeoutMs = 1000 } = {}) {
    if (!isValidTarget(ipAddress)) {
        throw new Error(`Invalid ping target address: ${ipAddress}`);
    }

    if (isWindows) {
        return {
            file: "ping",
            args: ["-n", String(count), "-w", String(timeoutMs), ipAddress]
        };
    }

    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    return {
        file: "ping",
        args: ["-c", String(count), "-W", String(timeoutSec), ipAddress]
    };
}

class PingService {
    async ping(ipAddress, options = {}) {
        const count = options.count ?? 2;
        const timeoutMs = options.timeoutMs ?? 1000;
        const opts = { count, timeoutMs };

        if (!isValidTarget(ipAddress)) {
            return { alive: false, packetLoss: 100, latency: null };
        }

        const { file, args } = getPingCommand(ipAddress, opts);

        try {
            const { stdout, stderr } = await execFileAsync(file, args, {
                timeout: timeoutMs * count + 2000,
                windowsHide: true
            });
            return parsePingOutput(stdout || stderr);
        } catch (error) {
            // ping exits with non-zero exit code if packets were lost or unreachable
            const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
            return parsePingOutput(output);
        }
    }
}

export default new PingService();
