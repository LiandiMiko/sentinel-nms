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

export const createDeviceSchema = z.object({
    name: z.string().min(3),
    ipAddress: ipv4Schema,
    community: z.string().min(1),
    snmpPort: z.coerce.number().int().positive().default(161),
    snmpVersion: z.enum(["1", "2c"]).default("2c"),
    apiPort: z.coerce.number().int().positive().default(8728),
    username: z.string().optional(),
    password: z.string().optional(),
    enabled: booleanSchema.default(true)
});

export const updateDeviceSchema = z.object({
    name: z.string().min(3).optional(),
    ipAddress: ipv4Schema.optional(),
    community: z.string().min(1).optional(),
    snmpPort: z.coerce.number().int().positive().optional(),
    snmpVersion: z.enum(["1", "2c"]).optional(),
    apiPort: z.coerce.number().int().positive().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    enabled: booleanSchema.optional()
});
