import nodemailer from "nodemailer";
import prisma from "../../core/database/prisma.js";
import { decryptSecret, encryptSecret } from "../../core/utils/secret.js";
import { validateChannelConfig } from "./notification.validator.js";

class NotificationService {
    safeChannel(channel) {
        const { config, ...safe } = channel;
        return {
            ...safe,
            config: {
                configured: Boolean(config),
                target: channel.type === "TELEGRAM" ? "Telegram chat" : channel.type === "EMAIL" ? "Email recipient" : "Webhook URL"
            }
        };
    }

    async list() {
        const channels = await prisma.notificationChannel.findMany({
            orderBy: { createdAt: "desc" }
        });
        return channels.map((channel) => this.safeChannel(channel));
    }

    async create({ name, type, config, enabled }) {
        const validatedConfig = validateChannelConfig(type, config);
        return this.safeChannel(await prisma.notificationChannel.create({
            data: { name, type, config: encryptSecret(validatedConfig), enabled }
        }));
    }

    async update(id, { name, config, enabled }) {
        const channel = await this.requireChannel(id);
        const validatedConfig = config === undefined
            ? undefined
            : validateChannelConfig(channel.type, config);
        return this.safeChannel(await prisma.notificationChannel.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(enabled !== undefined && { enabled }),
                ...(validatedConfig !== undefined && { config: encryptSecret(validatedConfig) })
            }
        }));
    }

    async delete(id) {
        await this.requireChannel(id);
        return prisma.notificationChannel.delete({ where: { id } });
    }

    async test(id) {
        const channel = await this.requireChannel(id);
        await this.send(channel, {
            title: "Sentinel NMS test notification",
            message: "Notification channel test succeeded."
        });
        return { delivered: true };
    }

    async sendForAlert(alert) {
        const links = await prisma.alertRuleChannel.findMany({
            where: { ruleId: alert.ruleId, channel: { enabled: true } },
            include: { channel: true, rule: true }
        });

        await Promise.all(links.map(async ({ channel, rule }) => {
            try {
                await this.send(channel, {
                    title: `Sentinel NMS: ${alert.deviceName}`,
                    message: alert.message,
                    deviceName: alert.deviceName,
                    deviceIpAddress: alert.deviceIpAddress,
                    severity: rule?.severity ?? "HIGH",
                    type: rule?.type,
                    state: "open",
                    triggeredAt: alert.triggeredAt
                });
                await prisma.notificationChannel.update({
                    where: { id: channel.id },
                    data: { lastSentAt: new Date(), lastError: null }
                });
            } catch (error) {
                console.error(`[Alerts] Notification channel ${channel.id} failed:`, error.message);
                await prisma.notificationChannel.update({
                    where: { id: channel.id },
                    data: { lastError: error.message.slice(0, 500) }
                });
            }
        }));
    }

    async sendForResolvedAlert(alert) {
        const links = await prisma.alertRuleChannel.findMany({
            where: { ruleId: alert.ruleId, channel: { enabled: true } },
            include: { channel: true, rule: true }
        });

        const durationMs = alert.triggeredAt && alert.resolvedAt
            ? new Date(alert.resolvedAt).getTime() - new Date(alert.triggeredAt).getTime()
            : 0;
        const durationSec = Math.max(0, Math.floor(durationMs / 1000));
        const durationText = durationSec >= 86400
            ? `${Math.floor(durationSec / 86400)}d ${Math.floor((durationSec % 86400) / 3600)}h`
            : durationSec >= 3600
                ? `${Math.floor(durationSec / 3600)}h ${Math.floor((durationSec % 3600) / 60)}m`
                : durationSec >= 60
                    ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
                    : `${durationSec}s`;

        await Promise.all(links.map(async ({ channel, rule }) => {
            try {
                await this.send(channel, {
                    title: `Sentinel NMS [RECOVERED]: ${alert.deviceName}`,
                    message: `${alert.message} telah pulih / normal.`,
                    deviceName: alert.deviceName,
                    deviceIpAddress: alert.deviceIpAddress,
                    severity: rule?.severity ?? "INFO",
                    type: rule?.type,
                    state: "resolved",
                    duration: durationText,
                    resolvedAt: alert.resolvedAt
                });
                await prisma.notificationChannel.update({
                    where: { id: channel.id },
                    data: { lastSentAt: new Date(), lastError: null }
                });
            } catch (error) {
                console.error(`[Alerts] Notification channel ${channel.id} failed:`, error.message);
                await prisma.notificationChannel.update({
                    where: { id: channel.id },
                    data: { lastError: error.message.slice(0, 500) }
                });
            }
        }));
    }

    async sendOperationalNotification({ title, message }) {
        const channels = await prisma.notificationChannel.findMany({
            where: { enabled: true },
            orderBy: { createdAt: "asc" }
        });
        if (channels.length === 0) return { attempted: 0, delivered: 0 };
        const results = await Promise.all(channels.map(async (channel) => {
            try {
                await this.send(channel, { title, message });
                await prisma.notificationChannel.update({
                    where: { id: channel.id },
                    data: { lastSentAt: new Date(), lastError: null }
                });
                return true;
            } catch (error) {
                console.error(`[Operations] Notification channel ${channel.id} failed:`, error.message);
                await prisma.notificationChannel.update({
                    where: { id: channel.id },
                    data: { lastError: error.message.slice(0, 500) }
                });
                return false;
            }
        }));
        return { attempted: channels.length, delivered: results.filter(Boolean).length };
    }

    async send(channel, notification) {
        const config = decryptSecret(channel.config);
        if (channel.type === "WEBHOOK") {
            const response = await fetch(config.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: "Sentinel NMS",
                    title: notification.title,
                    message: notification.message,
                    deviceName: notification.deviceName,
                    deviceIpAddress: notification.deviceIpAddress,
                    state: notification.state,
                    severity: notification.severity,
                    duration: notification.duration
                }),
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
            return;
        }

        if (channel.type === "TELEGRAM") {
            const isResolved = notification.state === "resolved";
            const icon = isResolved ? "🟢" : "🔴";
            const statusLabel = isResolved ? "RECOVERED / NORMAL" : "ALERT / INCIDENT";
            const escapeHtml = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            const lines = [
                `<b>${icon} [${statusLabel}] Sentinel NMS</b>`,
                `━━━━━━━━━━━━━━━━━━━━━━━━`,
                `<b>Perangkat :</b> ${escapeHtml(notification.deviceName || notification.title)}`,
                notification.deviceIpAddress ? `<b>IP Address:</b> <code>${escapeHtml(notification.deviceIpAddress)}</code>` : null,
                notification.severity ? `<b>Severity  :</b> ${escapeHtml(notification.severity)}` : null,
                `<b>Detail    :</b> ${escapeHtml(notification.message)}`,
                notification.duration ? `<b>Downtime  :</b> ${escapeHtml(notification.duration)}` : null,
                `━━━━━━━━━━━━━━━━━━━━━━━━`,
                `<i>Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</i>`
            ].filter(Boolean);

            const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: config.chatId,
                    text: lines.join("\n"),
                    parse_mode: "HTML"
                }),
                signal: AbortSignal.timeout(10000)
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.description || `Telegram returned HTTP ${response.status}`);
            return;
        }

        if (channel.type === "EMAIL") {
            const transporter = nodemailer.createTransport({
                host: config.host,
                port: config.port,
                secure: config.secure,
                ...(config.username && {
                    auth: { user: config.username, pass: config.password }
                })
            });
            await transporter.sendMail({
                from: config.from,
                to: config.to,
                subject: notification.title,
                text: notification.message
            });
            return;
        }
        throw new Error(`Unsupported notification channel: ${channel.type}`);
    }

    async requireChannel(id) {
        const channel = await prisma.notificationChannel.findUnique({ where: { id } });
        if (!channel) {
            const error = new Error("Notification channel not found");
            error.status = 404;
            throw error;
        }
        return channel;
    }
}

export default new NotificationService();
