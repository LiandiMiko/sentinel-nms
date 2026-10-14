import { z } from "zod";

export const channelConfigs = {
    WEBHOOK: z.object({
        url: z.string().url()
    }).strict(),
    TELEGRAM: z.object({
        botToken: z.string().min(1),
        chatId: z.string().min(1)
    }).strict(),
    EMAIL: z.object({
        host: z.string().min(1),
        port: z.coerce.number().int().min(1).max(65535),
        secure: z.boolean().default(false),
        username: z.string().optional(),
        password: z.string().optional(),
        from: z.string().email(),
        to: z.string().email()
    }).strict()
};

export function validateChannelConfig(type, config) {
    return channelConfigs[type].parse(config);
}

export const createChannelSchema = z.object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(["WEBHOOK", "TELEGRAM", "EMAIL"]),
    config: z.record(z.string(), z.unknown()),
    enabled: z.boolean().default(true)
}).strict().superRefine((channel, ctx) => {
    const parsed = channelConfigs[channel.type].safeParse(channel.config);
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            ctx.addIssue({ ...issue, path: ["config", ...issue.path] });
        }
    }
});

export const updateChannelSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional()
}).strict();
