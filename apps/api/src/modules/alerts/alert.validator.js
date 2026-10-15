import { z } from "zod";

const ruleFields = {
    name: z.string().trim().min(1).max(100),
    type: z.enum(["CPU_ABOVE", "MEMORY_ABOVE", "DEVICE_DOWN", "INTERFACE_DOWN"]),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
    threshold: z.coerce.number().min(0).max(100).optional().nullable(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).default(0),
    enabled: z.boolean().default(true),
    groupId: z.string().nullable().optional(),
    channelIds: z.array(z.string()).max(30).default([])
};

function requiresThreshold(type) {
    return type === "CPU_ABOVE" || type === "MEMORY_ABOVE";
}

function rejectsThreshold(type) {
    return type === "DEVICE_DOWN" || type === "INTERFACE_DOWN";
}

export const createRuleSchema = z.object(ruleFields).strict().superRefine((rule, ctx) => {
    if (requiresThreshold(rule.type) && rule.threshold == null) {
        ctx.addIssue({
            code: "custom",
            path: ["threshold"],
            message: `${rule.type === "MEMORY_ABOVE" ? "Memory" : "CPU"} rules require a threshold`
        });
    }
    if (rejectsThreshold(rule.type) && rule.threshold != null) {
        ctx.addIssue({
            code: "custom",
            path: ["threshold"],
            message: `${rule.type === "INTERFACE_DOWN" ? "Interface-down" : "Device-down"} rules do not use a threshold`
        });
    }
});

export const updateRuleSchema = z.object({
    ...ruleFields,
    severity: ruleFields.severity.optional(),
    durationSeconds: ruleFields.durationSeconds.optional(),
    enabled: ruleFields.enabled.optional(),
    channelIds: ruleFields.channelIds.optional()
}).partial().strict();

export const eventQuerySchema = z.object({
    state: z.enum(["open", "acknowledged", "resolved"]).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100)
});
