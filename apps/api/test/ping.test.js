import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pingService, { isValidTarget, parsePingOutput, getPingCommand } from "../src/core/ping/ping.service.js";

describe("ICMP ping service and output parser", () => {
    it("validates ping targets and rejects malicious shell inputs", () => {
        assert.equal(isValidTarget("192.168.1.1"), true);
        assert.equal(isValidTarget("10.0.0.254"), true);
        assert.equal(isValidTarget("router.local"), true);
        assert.equal(isValidTarget("127.0.0.1; rm -rf /"), false);
        assert.equal(isValidTarget("192.168.1.1 & calc"), false);
        assert.equal(isValidTarget(""), false);
        assert.equal(isValidTarget(null), false);
    });

    it("parses Windows successful ping output", () => {
        const output = `
Pinging 192.168.1.1 with 32 bytes of data:
Reply from 192.168.1.1: bytes=32 time=4ms TTL=64
Reply from 192.168.1.1: bytes=32 time=6ms TTL=64

Ping statistics for 192.168.1.1:
    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 4ms, Maximum = 6ms, Average = 5ms
`;
        const result = parsePingOutput(output);
        assert.equal(result.alive, true);
        assert.equal(result.packetLoss, 0);
        assert.equal(result.latency, 5);
    });

    it("parses Windows sub-millisecond ping output", () => {
        const output = `
Pinging 127.0.0.1 with 32 bytes of data:
Reply from 127.0.0.1: bytes=32 time<1ms TTL=128
Reply from 127.0.0.1: bytes=32 time<1ms TTL=128

Ping statistics for 127.0.0.1:
    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 0ms, Maximum = 0ms, Average = 0ms
`;
        const result = parsePingOutput(output);
        assert.equal(result.alive, true);
        assert.equal(result.packetLoss, 0);
        assert.equal(result.latency, 0);
    });

    it("parses Windows timeout ping output", () => {
        const output = `
Pinging 10.255.255.1 with 32 bytes of data:
Request timed out.
Request timed out.

Ping statistics for 10.255.255.1:
    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss),
`;
        const result = parsePingOutput(output);
        assert.equal(result.alive, false);
        assert.equal(result.packetLoss, 100);
        assert.equal(result.latency, null);
    });

    it("parses Linux iputils ping output", () => {
        const output = `
PING 192.168.1.1 (192.168.1.1) 56(84) bytes of data.
64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=12.4 ms
64 bytes from 192.168.1.1: icmp_seq=2 ttl=64 time=14.8 ms

--- 192.168.1.1 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1002ms
rtt min/avg/max/mdev = 12.400/13.600/14.800/1.200 ms
`;
        const result = parsePingOutput(output);
        assert.equal(result.alive, true);
        assert.equal(result.packetLoss, 0);
        assert.equal(result.latency, 13.6);
    });

    it("parses Linux busybox ping output with packet loss", () => {
        const output = `
PING 192.168.1.50 (192.168.1.50): 56 data bytes
64 bytes from 192.168.1.50: seq=0 ttl=64 time=25.2 ms

--- 192.168.1.50 ping statistics ---
2 packets transmitted, 1 packets received, 50% packet loss
round-trip min/avg/max = 25.2/25.2/25.2 ms
`;
        const result = parsePingOutput(output);
        assert.equal(result.alive, true);
        assert.equal(result.packetLoss, 50);
        assert.equal(result.latency, 25.2);
    });

    it("can ping local loopback synchronously", async () => {
        const result = await pingService.ping("127.0.0.1", { count: 1, timeoutMs: 1000 });
        assert.equal(result.alive, true);
        assert.equal(result.packetLoss, 0);
        assert.equal(typeof result.latency, "number");
    });
});
