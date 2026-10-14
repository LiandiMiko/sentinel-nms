import prisma from "../../core/database/prisma.js";
import notificationService from "./notification.service.js";

class AlertService {
    async listRules() {
        const rules = await prisma.alertRule.findMany({
            include: {
                group: true,
                channels: { include: { channel: { select: { id: true, name: true, type: true, enabled: true } } } },
                _count: { select: { events: true } }
            },
            orderBy: { createdAt: "desc" }
        });
        return rules.map((rule) => this.safeRule(rule));
    }

    async createRule(data) {
        const { channelIds, ...ruleData } = data;
        await this.validateGroup(ruleData.groupId);
        await this.validateChannels(channelIds);
        const rule = await prisma.alertRule.create({
            data: {
                ...ruleData,
                channels: {
                    create: channelIds.map((channelId) => ({ channelId }))
                }
            },
            include: { channels: { include: { channel: true } }, group: true }
        });
        return this.safeRule(rule);
    }

    async updateRule(id, data) {
        const currentRule = await this.requireRule(id);
        const { channelIds, ...ruleData } = data;
        if (ruleData.groupId !== undefined) await this.validateGroup(ruleData.groupId);
        if (channelIds !== undefined) await this.validateChannels(channelIds);
        const nextRule = { ...currentRule, ...ruleData };
        if (nextRule.type === "CPU_ABOVE" && nextRule.threshold == null) {
            const error = new Error("CPU alert rules require a threshold");
            error.status = 400;
            throw error;
        }
        if (nextRule.type === "DEVICE_DOWN" && nextRule.threshold != null) {
            const error = new Error("Device-down alert rules do not use a threshold");
            error.status = 400;
            throw error;
        }

        return prisma.$transaction(async (tx) => {
            if (channelIds !== undefined) {
                await tx.alertRuleChannel.deleteMany({ where: { ruleId: id } });
                if (channelIds.length) {
                    await tx.alertRuleChannel.createMany({
                        data: channelIds.map((channelId) => ({ ruleId: id, channelId }))
                    });
                }
            }
            const rule = await tx.alertRule.update({
                where: { id },
                data: ruleData,
                include: { channels: { include: { channel: true } }, group: true }
            });
            return this.safeRule(rule);
        });
    }

    async deleteRule(id) {
        await this.requireRule(id);
        return prisma.alertRule.delete({ where: { id } });
    }

    async listEvents({ state, limit = 100 }) {
        return prisma.alert.findMany({
            where: state ? { state } : {},
            include: {
                rule: { select: { id: true, name: true, severity: true, type: true } }
            },
            orderBy: { triggeredAt: "desc" },
            take: limit
        });
    }

    async acknowledge(id, acknowledgedBy = "operator") {
        const alert = await prisma.alert.findUnique({ where: { id } });
        if (!alert) {
            const error = new Error("Alert not found");
            error.status = 404;
            throw error;
        }
        if (alert.state !== "open") {
            const error = new Error("Only open alerts can be acknowledged");
            error.status = 409;
            throw error;
        }
        return prisma.alert.update({
            where: { id },
            data: {
                state: "acknowledged",
                acknowledgedAt: new Date(),
                acknowledgedBy
            },
            include: { rule: { select: { name: true, severity: true } } }
        });
    }

    async evaluate(results) {
        const [rules, devices] = await Promise.all([
            prisma.alertRule.findMany({
                include: { channels: { include: { channel: true } } }
            }),
            prisma.device.findMany({
                include: {
                    snapshot: true,
                    groups: { select: { groupId: true } }
                }
            })
        ]);

        const resultMap = new Map(results.map((result) => [result.deviceId, result]));
        for (const device of devices) {
            const result = resultMap.get(device.id);
            for (const rule of rules) {
                const inScope = !rule.groupId || device.groups.some(({ groupId }) => groupId === rule.groupId);
                const condition = rule.enabled && device.enabled && inScope
                    ? await this.isConditionMet(rule, device, result)
                    : { met: false, value: null, message: "" };
                const active = await prisma.alert.findFirst({
                    where: {
                        ruleId: rule.id,
                        deviceId: device.id,
                        state: { in: ["open", "acknowledged"] }
                    }
                });

                if (condition.met && !active) {
                    const alert = await prisma.alert.create({
                        data: {
                            ruleId: rule.id,
                            deviceId: device.id,
                            deviceName: device.name,
                            deviceIpAddress: device.ipAddress,
                            message: `${rule.name}: ${condition.message}`,
                            value: condition.value,
                            state: "open"
                        }
                    });
                    await notificationService.sendForAlert(alert);
                } else if (!condition.met && active) {
                    await prisma.alert.update({
                        where: { id: active.id },
                        data: { state: "resolved", resolvedAt: new Date() }
                    });
                }
            }
        }
    }

    async isConditionMet(rule, device, pollResult) {
        if (rule.type === "DEVICE_DOWN") {
            const downSince = device.downSince;
            const met = pollResult?.status === "down"
                && downSince
                && Date.now() - downSince.getTime() >= rule.durationSeconds * 1000;
            return {
                met: Boolean(met),
                value: downSince?.toISOString() ?? null,
                message: met ? `offline since ${downSince.toISOString()}` : ""
            };
        }

        if (rule.type === "CPU_ABOVE") {
            const cpu = Number(device.snapshot?.cpu) / 10;
            const met = pollResult?.status === "up"
                && Number.isFinite(cpu)
                && cpu > rule.threshold;
            return {
                met,
                value: Number.isFinite(cpu) ? `${cpu}%` : null,
                message: met ? `CPU is ${cpu}% (threshold ${rule.threshold}%)` : ""
            };
        }

        return { met: false, value: null, message: "" };
    }

    async requireRule(id) {
        const rule = await prisma.alertRule.findUnique({ where: { id } });
        if (!rule) {
            const error = new Error("Alert rule not found");
            error.status = 404;
            throw error;
        }
        return rule;
    }

    async validateGroup(groupId) {
        if (groupId == null) return;
        const exists = await prisma.deviceGroup.findUnique({ where: { id: groupId } });
        if (!exists) {
            const error = new Error("Device group not found");
            error.status = 400;
            throw error;
        }
    }

    async validateChannels(channelIds) {
        if (channelIds.length === 0) return;
        const count = await prisma.notificationChannel.count({
            where: { id: { in: channelIds } }
        });
        if (count !== new Set(channelIds).size) {
            const error = new Error("One or more notification channels were not found");
            error.status = 400;
            throw error;
        }
    }

    safeRule(rule) {
        return {
            ...rule,
            channels: rule.channels.map(({ channel, ...item }) => ({
                ...item,
                channel: {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    enabled: channel.enabled
                }
            }))
        };
    }
}

export default new AlertService();
