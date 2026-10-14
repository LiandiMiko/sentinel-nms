import { z } from "zod";

const ipv4Schema = z.string().regex(
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/,
    "Invalid IPv4 address"
);

const booleanSchema = z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
}, z.boolean());

const optionalCredential = (schema) => z.preprocess(
    (value) => value === "" ? undefined : value,
    schema.optional()
);

const deviceFields = {
    name: z.string().min(3),
    ipAddress: ipv4Schema,
    community: z.string().min(1).max(128).default("public"),
    snmpPort: z.coerce.number().int().min(1).max(65535).default(161),
    snmpVersion: z.enum(["1", "2c", "3"]).default("2c"),
    snmpSecurityName: optionalCredential(z.string().trim().min(1).max(32)),
    snmpSecurityLevel: z.enum(["noAuthNoPriv", "authNoPriv", "authPriv"]).default("authPriv"),
    snmpAuthProtocol: z.enum(["md5", "sha", "sha224", "sha256", "sha384", "sha512"]).default("sha"),
    snmpAuthPassword: optionalCredential(z.string().min(8).max(256)),
    snmpPrivProtocol: z.enum(["des", "aes", "aes256b", "aes256r"]).default("aes"),
    snmpPrivPassword: optionalCredential(z.string().min(8).max(256)),
    apiPort: z.coerce.number().int().positive().default(8728),
    routerOsPort: z.coerce.number().int().min(1).max(65535).default(443),
    username: optionalCredential(z.string().max(128)),
    password: optionalCredential(z.string().max(256)),
    enabled: booleanSchema.default(true)
};

function validateSnmpSecurity(device, context) {
    if (device.snmpVersion !== "3") return;
    if (!device.snmpSecurityName) {
        context.addIssue({ code: "custom", path: ["snmpSecurityName"], message: "SNMPv3 username is required" });
    }
    if (device.snmpSecurityLevel !== "noAuthNoPriv" && !device.snmpAuthPassword) {
        context.addIssue({ code: "custom", path: ["snmpAuthPassword"], message: "SNMPv3 authentication password is required" });
    }
    if (device.snmpSecurityLevel === "authPriv" && !device.snmpPrivPassword) {
        context.addIssue({ code: "custom", path: ["snmpPrivPassword"], message: "SNMPv3 privacy password is required" });
    }
}

export const createDeviceSchema = z.object(deviceFields).superRefine(validateSnmpSecurity);

export const updateDeviceSchema = z.object(
    Object.fromEntries(Object.entries(deviceFields).map(([key, schema]) => [
        key,
        key === "community"
            ? z.string().min(1).optional()
            : schema.optional()
    ]))
);
