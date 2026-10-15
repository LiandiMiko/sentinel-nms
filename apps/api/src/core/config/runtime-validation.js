const DEFAULT_WEB_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080"
];

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function inspectRuntimeConfiguration(database, environment = process.env) {
    const errors = [];
    const warnings = [];
    const port = Number(environment.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push("PORT must be an integer between 1 and 65535.");
    }
    if (!environment.DATABASE_URL?.trim()) {
        errors.push("DATABASE_URL must be configured.");
    }

    const backupRetention = Number(environment.SQLITE_BACKUP_RETENTION_DAYS || 7);
    if (!Number.isInteger(backupRetention) || backupRetention < 1 || backupRetention > 3650) {
        errors.push("SQLITE_BACKUP_RETENTION_DAYS must be an integer between 1 and 3650.");
    }

    const origins = (environment.WEB_ORIGINS || DEFAULT_WEB_ORIGINS.join(","))
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    for (const origin of origins) {
        try {
            const parsed = new URL(origin);
            if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
                errors.push("WEB_ORIGINS must contain exact http(s) origins without paths.");
                break;
            }
        } catch {
            errors.push("WEB_ORIGINS contains an invalid URL origin.");
            break;
        }
    }

    for (const name of ["DEVICE_ENCRYPTION_KEY", "ALERT_ENCRYPTION_KEY"]) {
        const key = environment[name];
        if (key && key.length < 32) {
            errors.push(`${name} must contain at least 32 characters when set.`);
        }
    }

    const tables = await database.$queryRaw`
        SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'
    `;
    const tableNames = new Set(tables.map(({ name }) => name));
    const hasUserTable = tableNames.has("User");
    const userCount = hasUserTable ? await database.user.count() : 0;
    if (userCount === 0) {
        const email = environment.AUTH_INITIAL_ADMIN_EMAIL?.trim() || "";
        const password = environment.AUTH_INITIAL_ADMIN_PASSWORD || "";
        if (!validEmail(email) || password.length < 12 || password.length > 128) {
            errors.push(
                "A valid AUTH_INITIAL_ADMIN_EMAIL and AUTH_INITIAL_ADMIN_PASSWORD (12–128 characters) are required until the first Super Admin exists."
            );
        }
    }
    if (!hasUserTable) {
        warnings.push("Database migrations are not applied yet; the first API startup will apply them.");
    }

    const hasEncryptedDeviceSecrets = tableNames.has("Device") && await database.device.count({
        where: {
            OR: [
                { snmpAuthPassword: { startsWith: "enc:v1:" } },
                { snmpPrivPassword: { startsWith: "enc:v1:" } },
                { username: { not: null }, password: { startsWith: "enc:v1:" } }
            ]
        }
    }) > 0;
    if (hasEncryptedDeviceSecrets && (!environment.DEVICE_ENCRYPTION_KEY || environment.DEVICE_ENCRYPTION_KEY.length < 32)) {
        errors.push("DEVICE_ENCRYPTION_KEY (at least 32 characters) is required to decrypt saved device credentials.");
    } else if (!environment.DEVICE_ENCRYPTION_KEY) {
        warnings.push("DEVICE_ENCRYPTION_KEY is needed before saving SNMPv3 or RouterOS credentials.");
    }

    const hasNotificationChannels = tableNames.has("NotificationChannel")
        && await database.notificationChannel.count() > 0;
    if (hasNotificationChannels && (!environment.ALERT_ENCRYPTION_KEY || environment.ALERT_ENCRYPTION_KEY.length < 32)) {
        errors.push("ALERT_ENCRYPTION_KEY (at least 32 characters) is required to decrypt saved notification channels.");
    } else if (!environment.ALERT_ENCRYPTION_KEY) {
        warnings.push("ALERT_ENCRYPTION_KEY is needed before saving notification channels.");
    }

    return { errors, warnings };
}

export async function validateRuntimeConfiguration(database, environment = process.env) {
    const result = await inspectRuntimeConfiguration(database, environment);
    for (const warning of result.warnings) {
        console.warn(`[Preflight] Warning: ${warning}`);
    }
    if (result.errors.length) {
        throw new Error(`Runtime configuration is invalid:\n${result.errors.map((error) => `- ${error}`).join("\n")}`);
    }
    return result;
}
