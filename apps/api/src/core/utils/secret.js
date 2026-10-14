import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(environmentVariable, purpose) {
    const secret = process.env[environmentVariable];
    if (!secret || secret.length < 32) {
        const error = new Error(`Set ${environmentVariable} to a secret of at least 32 characters before configuring ${purpose}.`);
        error.status = 503;
        throw error;
    }
    return createHash("sha256").update(secret).digest();
}

function encrypt(value, key) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final()
    ]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

function decrypt(value, key) {
    const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]).toString("utf8"));
}

export function encryptSecret(value) {
    return encrypt(value, encryptionKey("ALERT_ENCRYPTION_KEY", "notification channels"));
}

export function decryptSecret(value) {
    return decrypt(value, encryptionKey("ALERT_ENCRYPTION_KEY", "notification channels"));
}

const DEVICE_SECRET_PREFIX = "enc:v1:";

export function encryptDeviceSecret(value) {
    return `${DEVICE_SECRET_PREFIX}${encrypt(
        value,
        encryptionKey("DEVICE_ENCRYPTION_KEY", "device credentials")
    )}`;
}

export function decryptDeviceSecret(value) {
    if (!value?.startsWith(DEVICE_SECRET_PREFIX)) return value;
    return decrypt(
        value.slice(DEVICE_SECRET_PREFIX.length),
        encryptionKey("DEVICE_ENCRYPTION_KEY", "device credentials")
    );
}
