import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";
import prisma from "../../core/database/prisma.js";

const MAX_EXCEL_ROWS = 50000;
const MAX_PDF_ROWS = 5000;
/** Match device-event.repository: resolved outages shorter than this are treated as flaps. */
const MIN_OUTAGE_DURATION_MS = 60 * 1000;

function formatDurationSeconds(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    if (days) return `${days}d ${hours}h ${minutes}m`;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${remaining}s`;
    return `${remaining}s`;
}

class ReportService {
    async rows(type, { from, to, deviceId }, format) {
        const take = format === "pdf" ? MAX_PDF_ROWS : MAX_EXCEL_ROWS;
        let rows;
        if (type === "metrics") {
            rows = await prisma.metric.findMany({
                where: {
                    createdAt: { gte: from, lte: to },
                    ...(deviceId ? { deviceId } : {})
                },
                include: { device: { select: { name: true, ipAddress: true } } },
                orderBy: { createdAt: "desc" },
                take: take + 1
            });
        } else if (type === "alerts") {
            rows = await prisma.alert.findMany({
                where: {
                    triggeredAt: { gte: from, lte: to },
                    ...(deviceId ? { deviceId } : {})
                },
                include: { rule: { select: { name: true, severity: true } } },
                orderBy: { triggeredAt: "desc" },
                take: take + 1
            });
        } else {
            // Fetch extra then filter flaps so short-lived noise does not fill the report.
            const fetched = await prisma.deviceEvent.findMany({
                where: {
                    startedAt: { gte: from, lte: to },
                    ...(deviceId ? { deviceId } : {})
                },
                include: { device: { select: { name: true, ipAddress: true } } },
                orderBy: { startedAt: "desc" },
                take: Math.min(take * 3, MAX_EXCEL_ROWS + 1)
            });
            rows = fetched.filter((event) => {
                if (!event.resolvedAt) return true;
                const durationMs = event.resolvedAt.getTime() - event.startedAt.getTime();
                return !Number.isFinite(durationMs) || durationMs >= MIN_OUTAGE_DURATION_MS;
            });
        }
        if (rows.length > take) {
            const error = new Error(`This ${format.toUpperCase()} report exceeds its ${take.toLocaleString()}-row limit. Narrow the date range or filter the selected device.`);
            error.status = 413;
            throw error;
        }
        return rows;
    }

    columns(type) {
        return type === "metrics"
            ? [
                { header: "Timestamp (UTC)", key: "timestamp", width: 24 },
                { header: "Device", key: "device", width: 26 },
                { header: "IP address", key: "ipAddress", width: 18 },
                { header: "Metric", key: "metric", width: 28 },
                { header: "Value", key: "value", width: 24 },
                { header: "Unit", key: "unit", width: 14 }
            ]
            : type === "alerts"
                ? [
                { header: "Triggered (UTC)", key: "timestamp", width: 24 },
                { header: "Severity", key: "severity", width: 14 },
                { header: "Rule", key: "rule", width: 28 },
                { header: "Device", key: "device", width: 26 },
                { header: "IP address", key: "ipAddress", width: 18 },
                { header: "State", key: "state", width: 16 },
                { header: "Message", key: "message", width: 60 }
                ]
                : [
                    { header: "Started (UTC)", key: "timestamp", width: 24 },
                    { header: "Resolved (UTC)", key: "resolvedAt", width: 24 },
                    { header: "Duration", key: "duration", width: 18 },
                    { header: "Type", key: "type", width: 22 },
                    { header: "Device", key: "device", width: 26 },
                    { header: "IP address", key: "ipAddress", width: 18 },
                    { header: "Interface / subject", key: "subject", width: 30 },
                    { header: "Details", key: "message", width: 60 }
                ];
    }

    values(type, row) {
        if (type === "metrics") {
            return {
                timestamp: row.createdAt.toISOString(),
                device: row.device.name,
                ipAddress: row.device.ipAddress,
                metric: row.name,
                value: row.value,
                unit: row.unit ?? ""
            };
        }
        if (type === "alerts") return {
            timestamp: row.triggeredAt.toISOString(),
            severity: row.rule.severity,
            rule: row.rule.name,
            device: row.deviceName,
            ipAddress: row.deviceIpAddress,
            state: row.state,
            message: row.message
        };
        const durationSeconds = Math.max(0, Math.floor(
            ((row.resolvedAt ?? new Date()).getTime() - row.startedAt.getTime()) / 1000
        ));
        return {
            timestamp: row.startedAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? "Ongoing",
            duration: formatDurationSeconds(durationSeconds),
            type: row.type === "device-outage" ? "Device" : row.type === "interface-outage" ? "Interface" : row.type,
            device: row.device.name,
            ipAddress: row.device.ipAddress,
            subject: row.subject,
            message: row.message
        };
    }

    async export(type, format, filters) {
        const rows = await this.rows(type, filters, format);
        const columns = this.columns(type);
        const values = rows.map((row) => this.values(type, row));
        return format === "xlsx"
            ? this.excel(columns, values)
            : this.pdf(type, columns, values);
    }

    async excel(columns, rows) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Sentinel report");
        sheet.columns = columns;
        sheet.addRows(rows);
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF26385C" } };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        return Buffer.from(await workbook.xlsx.writeBuffer());
    }

    async pdf(type, columns, rows) {
        const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 32 });
        const stream = new PassThrough();
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        const completion = new Promise((resolve, reject) => {
            stream.on("end", resolve);
            stream.on("error", reject);
            document.on("error", reject);
        });
        document.pipe(stream);
        document.fontSize(17).text(`Sentinel NMS ${type} report`, { continued: false });
        document.moveDown(0.5).fontSize(8).fillColor("#606a78");
        document.text(`Generated ${new Date().toISOString()} · ${rows.length} records`);
        document.moveDown();

        const widths = type === "metrics"
            ? [90, 110, 72, 140, 110, 70]
            : type === "alerts"
                ? [90, 58, 105, 90, 70, 65, 250]
                : [90, 90, 55, 95, 90, 70, 110, 218];
        const headers = columns.map(({ header }) => header);
        const rowHeight = 22;
        const drawRow = (cells, header = false) => {
            if (document.y + rowHeight > document.page.height - document.page.margins.bottom) {
                document.addPage();
            }
            const startY = document.y;
            if (header) {
                document.save().rect(document.page.margins.left, startY, document.page.width - 64, rowHeight).fill("#26385c").restore();
            }
            let x = document.page.margins.left + 3;
            cells.forEach((cell, index) => {
                document.fillColor(header ? "#ffffff" : "#263044")
                    .fontSize(header ? 7 : 6.5)
                    .text(String(cell ?? ""), x, startY + 6, {
                        width: widths[index] - 5,
                        height: rowHeight - 6,
                        ellipsis: true,
                        lineBreak: false
                    });
                x += widths[index];
            });
            document.y = startY + rowHeight;
        };
        drawRow(headers, true);
        for (const row of rows) drawRow(columns.map(({ key }) => row[key]));
        document.end();
        await completion;
        return Buffer.concat(chunks);
    }
}

export default new ReportService();
