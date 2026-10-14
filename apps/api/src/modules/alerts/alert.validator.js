import { z } from "zod";

const ruleFields = {
    name: z.string().trim().min(1).max(100),
    type: z.enum(["CPU_ABOVE", "DEVICE_DOWN"]),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
    threshold: z.coerce.number().min(0).max(100).optional().nullable(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).default(0),
    enabled: z.boolean().default(true),
    groupId: z.string().nullable().optional(),
    channelIds: z.array(z.string()).max(30).default([])
};

export const createRuleSchema = z.object(ruleFields).strict().superRefine((rule, ctx) => {
    if (rule.type === "CPU_ABOVE" && rule.threshold == null) {
        ctx.addIssue({ code: "custom", path: ["threshold"], message: "CPU rules require a threshold" });
    }
    if (rule.type === "DEVICE_DOWN" && rule.threshold != null) {
        ctx.addIssue({ code: "custom", path: ["threshold"], message: "Device-down rules do not use a threshold" });
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
