import { randomUUID } from "node:crypto";
import prisma from "../../core/database/prisma.js";

class AuditService {
    async record(entry) {
        await prisma.$executeRaw`
            INSERT INTO "AuditLog"
                ("id", "actorId", "actorEmail", "action", "method", "path", "status", "ipAddress", "userAgent")
            VALUES
                (${randomUUID()}, ${entry.actorId}, ${entry.actorEmail}, ${entry.action}, ${entry.method},
                 ${entry.path}, ${entry.status}, ${entry.ipAddress}, ${entry.userAgent})
        `;
    }

    async list({ limit, offset }) {
        const [items, total] = await Promise.all([
            prisma.$queryRaw`
                SELECT "id", "actorId", "actorEmail", "action", "method", "path", "status",
                       "ipAddress", "userAgent", "createdAt"
                FROM "AuditLog"
                ORDER BY "createdAt" DESC
                LIMIT ${limit} OFFSET ${offset}
            `,
            prisma.$queryRaw`SELECT COUNT(*) AS "total" FROM "AuditLog"`
        ]);
        return { items, total: Number(total[0].total), limit, offset };
    }
}

export default new AuditService();
