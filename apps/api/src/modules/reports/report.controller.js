import { z } from "zod";
import prisma from "../../core/database/prisma.js";
import reportService from "./report.service.js";

const querySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    deviceId: z.string().min(1).optional()
}).strict();

class ReportController {
    async export(req, res) {
        const { type, format } = req.params;
        if (!["metrics", "alerts", "outages"].includes(type) || !["pdf", "xlsx"].includes(format)) {
            const error = new Error("Unsupported report type or format.");
            error.status = 404;
            throw error;
        }
        const query = querySchema.parse(req.query);
        const parseDate = (value, endOfDay = false) => {
            if (!value) return undefined;
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                const date = new Date(`${value}T00:00:00.000Z`);
                if (endOfDay) date.setUTCHours(23, 59, 59, 999);
                return date;
            }
            return new Date(value);
        };
        const to = parseDate(query.to, true) ?? new Date();
        const from = parseDate(query.from) ?? new Date(to.getTime() - (7 * 24 * 60 * 60 * 1000));
        if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
            const error = new Error("Report start date must be earlier than or equal to its end date.");
            error.status = 400;
            throw error;
        }
        const dayMilliseconds = 24 * 60 * 60 * 1000;
        if (Math.ceil((to.getTime() - from.getTime() + 1) / dayMilliseconds) > 31) {
            const error = new Error("Report date range cannot exceed 31 days.");
            error.status = 400;
            throw error;
        }
        if (query.deviceId && !(await prisma.device.findUnique({ where: { id: query.deviceId }, select: { id: true } }))) {
            const error = new Error("Device not found.");
            error.status = 404;
            throw error;
        }
        const buffer = await reportService.export(type, format, { from, to, deviceId: query.deviceId });
        const extension = format === "xlsx" ? "xlsx" : "pdf";
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="sentinel-${type}-${date}.${extension}"`);
        return res.send(buffer);
    }
}

export default new ReportController();
