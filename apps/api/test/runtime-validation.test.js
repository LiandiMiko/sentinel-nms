import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectRuntimeConfiguration } from "../src/core/config/runtime-validation.js";

function makeDatabase({ users = 1, encryptedDevices = 0, channels = 0, tables = true } = {}) {
    return {
        async $queryRaw() {
            return tables
                ? [{ name: "User" }, { name: "Device" }, { name: "NotificationChannel" }]
                : [];
        },
        user: { async count() { return users; } },
        device: { async count() { return encryptedDevices; } },
        notificationChannel: { async count() { return channels; } }
    };
}

const baseEnvironment = {
    DATABASE_URL: "file:./dev.db",
    PORT: "3000",
    WEB_ORIGINS: "http://localhost:5173",
    SQLITE_BACKUP_RETENTION_DAYS: "7"
};

describe("runtime configuration preflight", () => {
    it("warns about optional encryption keys without rejecting an empty setup", async () => {
        const result = await inspectRuntimeConfiguration(makeDatabase(), baseEnvironment);
        assert.deepEqual(result.errors, []);
        assert.equal(result.warnings.length, 2);
    });

    it("requires initial admin credentials only before the first account exists", async () => {
        const emptyEnvironment = {
            ...baseEnvironment,
            AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
            AUTH_INITIAL_ADMIN_PASSWORD: "a-unique-password-with-more-than-12"
        };
        assert.deepEqual((await inspectRuntimeConfiguration(
            makeDatabase({ users: 0 }),
            emptyEnvironment
        )).errors, []);
        assert.match((await inspectRuntimeConfiguration(
            makeDatabase({ users: 0 }),
            baseEnvironment
        )).errors[0], /AUTH_INITIAL_ADMIN_EMAIL/);
        assert.deepEqual((await inspectRuntimeConfiguration(
            makeDatabase({ users: 1 }),
            baseEnvironment
        )).errors, []);
    });

    it("requires valid keys when encrypted device or notification data exists", async () => {
        const result = await inspectRuntimeConfiguration(
            makeDatabase({ encryptedDevices: 1, channels: 1 }),
            baseEnvironment
        );
        assert.match(result.errors.join(" "), /DEVICE_ENCRYPTION_KEY/);
        assert.match(result.errors.join(" "), /ALERT_ENCRYPTION_KEY/);
    });

    it("rejects invalid port, origins, retention, and short configured keys", async () => {
        const result = await inspectRuntimeConfiguration(makeDatabase(), {
            ...baseEnvironment,
            PORT: "70000",
            WEB_ORIGINS: "http://localhost:5173/path",
            SQLITE_BACKUP_RETENTION_DAYS: "0",
            DEVICE_ENCRYPTION_KEY: "too-short"
        });
        assert.match(result.errors.join(" "), /PORT/);
        assert.match(result.errors.join(" "), /WEB_ORIGINS/);
        assert.match(result.errors.join(" "), /SQLITE_BACKUP_RETENTION_DAYS/);
        assert.match(result.errors.join(" "), /DEVICE_ENCRYPTION_KEY/);
    });
});
