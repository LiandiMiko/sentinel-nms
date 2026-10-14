import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { describe, it } from "node:test";
import {
    createLoginRateLimiter,
    csrfProtection,
    enforceRolePermissions,
    readSessionCookie
} from "../src/modules/auth/auth.middleware.js";
import { hashPassword, verifyPassword } from "../src/modules/auth/auth.service.js";

describe("authentication primitives", () => {
    it("hashes new passwords with bcrypt and verifies only the matching password", async () => {
        const storedHash = await hashPassword("a-long-test-password");
        assert.match(storedHash, /^bcrypt-sha256\$12\$\$2[aby]\$12\$/);
        assert.equal(await verifyPassword("a-long-test-password", storedHash), true);
        assert.equal(await verifyPassword("another-password", storedHash), false);
        assert.equal(await verifyPassword("a-long-test-password", "invalid"), false);
    });

    it("verifies the entire long password rather than a bcrypt-truncated prefix", async () => {
        const password = `${"long-password-".repeat(8)}🔐`;
        const storedHash = await hashPassword(password);

        assert.equal(await verifyPassword(password, storedHash), true);
        assert.equal(await verifyPassword(`${password}different`, storedHash), false);
    });

    it("continues to verify existing scrypt hashes during password migration", async () => {
        const password = "existing-test-password";
        const salt = randomBytes(16).toString("hex");
        const derivedKey = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
        const legacyHash = `scrypt$16384$8$1$${salt}$${derivedKey}`;

        assert.equal(await verifyPassword(password, legacyHash), true);
        assert.equal(await verifyPassword("wrong-password", legacyHash), false);
    });

    it("reads only the named session cookie", () => {
        assert.equal(readSessionCookie({ headers: { cookie: "other=value; sentinel_session=abc_123-xyz" } }), "abc_123-xyz");
        assert.equal(readSessionCookie({ headers: { cookie: "sentinel_session=" } }), "");
        assert.equal(readSessionCookie({ headers: {} }), "");
    });
});

describe("authorization middleware", () => {
    function responseRecorder() {
        return {
            statusCode: 200,
            body: null,
            headers: {},
            setHeader(name, value) { this.headers[name] = value; },
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; }
        };
    }

    it("allows viewer reads but denies mutations", () => {
        const next = () => {};
        const allowedResponse = responseRecorder();
        enforceRolePermissions({ method: "GET", path: "/devices", authUser: { role: "VIEWER" } }, allowedResponse, next);
        assert.equal(allowedResponse.statusCode, 200);

        const deniedResponse = responseRecorder();
        enforceRolePermissions({ method: "POST", path: "/devices", authUser: { role: "VIEWER" } }, deniedResponse, next);
        assert.equal(deniedResponse.statusCode, 403);
    });

    it("restricts global settings changes to Super Admin", () => {
        const deniedResponse = responseRecorder();
        enforceRolePermissions({ method: "PATCH", path: "/settings", authUser: { role: "ADMIN" } }, deniedResponse, () => {});
        assert.equal(deniedResponse.statusCode, 403);
    });

    it("requires configured origins for state-changing requests", () => {
        const guard = csrfProtection(new Set(["https://nms.example"]));
        const deniedResponse = responseRecorder();
        guard({ method: "POST", get: () => "https://evil.example" }, deniedResponse, () => {});
        assert.equal(deniedResponse.statusCode, 403);

        const allowedResponse = responseRecorder();
        guard({ method: "POST", get: () => "https://nms.example" }, allowedResponse, () => {});
        assert.equal(allowedResponse.statusCode, 200);
    });

    it("limits repeated login attempts per client", () => {
        const limiter = createLoginRateLimiter({ windowMs: 60_000, maxAttempts: 1 });
        const request = { ip: "test-client" };
        const firstResponse = responseRecorder();
        limiter(request, firstResponse, () => {});
        assert.equal(firstResponse.statusCode, 200);

        const blockedResponse = responseRecorder();
        limiter(request, blockedResponse, () => {});
        assert.equal(blockedResponse.statusCode, 429);
    });
});
