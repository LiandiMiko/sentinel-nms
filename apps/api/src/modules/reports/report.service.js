import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";
import prisma from "../../core/database/prisma.js";

const MAX_EXCEL_ROWS = 50000;
const MAX_PDF_ROWS = 5000;

class ReportService {
    async rows(type, { from, to, deviceId }, format) {
        const take = format === "pdf" ? MAX_PDF_ROWS : MAX_EXCEL_ROWS;
        const rows = type === "metrics"
            ? await prisma.metric.findMany({
                where: {
                    createdAt: { gte: from, lte: to },
                    ...(deviceId ? { deviceId } : {})
                },
                include: { device: { select: { name: true, ipAddress: true } } },
                orderBy: { createdAt: "desc" },
                take: take + 1
            })
            : await prisma.alert.findMany({
                where: {
                    triggeredAt: { gte: from, lte: to },
                    ...(deviceId ? { deviceId } : {})
                },
                include: { rule: { select: { name: true, severity: true } } },
                orderBy: { triggeredAt: "desc" },
                take: take + 1
            });
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
            : [
                { header: "Triggered (UTC)", key: "timestamp", width: 24 },
                { header: "Severity", key: "severity", width: 14 },
                { header: "Rule", key: "rule", width: 28 },
                { header: "Device", key: "device", width: 26 },
                { header: "IP address", key: "ipAddress", width: 18 },
                { header: "State", key: "state", width: 16 },
                { header: "Message", key: "message", width: 60 }
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
        return {
            timestamp: row.triggeredAt.toISOString(),
            severity: row.rule.severity,
            rule: row.rule.name,
            device: row.deviceName,
            ipAddress: row.deviceIpAddress,
            state: row.state,
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
            : [90, 58, 105, 90, 70, 65, 250];
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
