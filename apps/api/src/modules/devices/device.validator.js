import { z } from "zod";

const ipv4Schema = z.string().regex(
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/,
    "Invalid IPv4 address"
);

export const createDeviceSchema = z.object({
    name: z.string().min(3),
    ipAddress: ipv4Schema,
    community: z.string().min(1),
    snmpPort: z.coerce.number().int().positive().default(161),
    snmpVersion: z.string().default("2c"),
    apiPort: z.coerce.number().int().positive().default(8728),
    username: z.string().optional(),
    password: z.string().optional(),
    enabled: z.coerce.boolean().default(true)
});

export const updateDeviceSchema = z.object({
    name: z.string().min(3).optional(),
    ipAddress: ipv4Schema.optional(),
    community: z.string().min(1).optional(),
    snmpPort: z.coerce.number().int().positive().optional(),
    snmpVersion: z.string().optional(),
    apiPort: z.coerce.number().int().positive().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    enabled: z.coerce.boolean().optional()
});
