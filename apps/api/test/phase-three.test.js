import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { parseDiscoveryTargets } from "../src/modules/discovery/discovery.service.js";
import { createDeviceSchema } from "../src/modules/devices/device.validator.js";
import {
    decryptDeviceSecret,
    decryptSecret,
    encryptDeviceSecret,
    encryptSecret
} from "../src/core/utils/secret.js";
import reportService from "../src/modules/reports/report.service.js";
import { createSession } from "../src/core/snmp/session.js";

const previousDeviceKey = process.env.DEVICE_ENCRYPTION_KEY;
const previousAlertKey = process.env.ALERT_ENCRYPTION_KEY;
process.env.DEVICE_ENCRYPTION_KEY = "phase-three-test-key-with-32-characters-min";
process.env.ALERT_ENCRYPTION_KEY = "phase-three-alert-test-key-with-32-char";
after(() => {
    if (previousDeviceKey === undefined) delete process.env.DEVICE_ENCRYPTION_KEY;
    else process.env.DEVICE_ENCRYPTION_KEY = previousDeviceKey;
    if (previousAlertKey === undefined) delete process.env.ALERT_ENCRYPTION_KEY;
    else process.env.ALERT_ENCRYPTION_KEY = previousAlertKey;
});

describe("private SNMP discovery range", () => {
    it("expands only usable addresses of a private /24", () => {
        const addresses = parseDiscoveryTargets("192.168.10.0/24");
        assert.equal(addresses.length, 254);
        assert.equal(addresses[0], "192.168.10.1");
        assert.equal(addresses.at(-1), "192.168.10.254");
    });

    it("supports a private single-host scan", () => {
        assert.deepEqual(parseDiscoveryTargets("10.2.3.4/32"), ["10.2.3.4"]);
    });

    it("rejects public, oversized, and non-network ranges", () => {
        assert.throws(() => parseDiscoveryTargets("8.8.8.0/24"), /RFC1918/);
        assert.throws(() => parseDiscoveryTargets("10.0.0.0/23"), /256 addresses/);
        assert.throws(() => parseDiscoveryTargets("10.0.0.1/24"), /canonical/);
    });
});

describe("SNMPv3 device validation and secret storage", () => {
    it("accepts the device form's empty optional credentials for SNMPv2c", () => {
        const result = createDeviceSchema.safeParse({
            name: "Router",
            ipAddress: "10.0.0.1",
            community: "public",
            snmpPort: "161",
            snmpVersion: "2c",
            snmpSecurityName: "",
            snmpSecurityLevel: "authPriv",
            snmpAuthProtocol: "sha",
            snmpAuthPassword: "",
            snmpPrivProtocol: "aes",
            snmpPrivPassword: "",
            routerOsPort: 443,
            username: "",
            password: "",
            enabled: true
        });
        assert.equal(result.success, true);
        assert.equal(result.data.snmpSecurityName, undefined);
        assert.equal(result.data.snmpAuthPassword, undefined);
        assert.equal(result.data.snmpPrivPassword, undefined);
    });

    it("requires security identity and the credentials selected by the security level", () => {
        assert.equal(createDeviceSchema.safeParse({
            name: "Router",
            ipAddress: "10.0.0.1",
            snmpVersion: "3",
            snmpSecurityName: "monitor",
            snmpSecurityLevel: "noAuthNoPriv"
        }).success, true);
        assert.equal(createDeviceSchema.safeParse({
            name: "Router",
            ipAddress: "10.0.0.1",
            snmpVersion: "3",
            snmpSecurityName: "monitor",
            snmpSecurityLevel: "authPriv"
        }).success, false);
        assert.equal(createDeviceSchema.safeParse({
            name: "Router",
            ipAddress: "10.0.0.1",
            snmpVersion: "3",
            snmpSecurityName: "monitor",
            snmpSecurityLevel: "authPriv",
            snmpAuthPassword: "auth-pass",
            snmpPrivPassword: "priv-pass"
        }).success, true);
    });

    it("encrypts device passwords at rest and can decrypt them with the configured key", () => {
        const encrypted = encryptDeviceSecret("sample-router-password");
        assert.match(encrypted, /^enc:v1:/);
        assert.notEqual(encrypted, "sample-router-password");
        assert.equal(decryptDeviceSecret(encrypted), "sample-router-password");
    });

    it("keeps existing notification-channel secret encryption compatible", () => {
        const config = { botToken: "sample-token", chatId: "12345" };
        assert.deepEqual(decryptSecret(encryptSecret(config)), config);
    });

    it("creates an authenticated and encrypted SNMPv3 session", () => {
        const session = createSession("127.0.0.1", "unused", 161, "3", {
            snmpSecurityName: "monitor",
            snmpSecurityLevel: "authPriv",
            snmpAuthProtocol: "sha256",
            snmpAuthPassword: encryptDeviceSecret("auth-password"),
            snmpPrivProtocol: "aes",
            snmpPrivPassword: encryptDeviceSecret("privacy-password")
        });
        assert.equal(typeof session.get, "function");
        session.close();
    });
});

describe("report rendering", () => {
    const columns = [{ header: "Metric", key: "metric", width: 24 }];
    const rows = [{ metric: "cpu" }];

    it("creates a valid Excel workbook", async () => {
        const buffer = await reportService.excel(columns, rows);
        assert.equal(buffer.subarray(0, 2).toString(), "PK");
    });

    it("creates a PDF document", async () => {
        const buffer = await reportService.pdf("metrics", columns, rows);
        assert.equal(buffer.subarray(0, 8).toString(), "%PDF-1.3");
        assert.equal(buffer.subarray(-6).toString(), "%%EOF\n");
    });
});
