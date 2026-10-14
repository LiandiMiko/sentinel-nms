import auditService from "./audit.service.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function auditRequest(req, res, next) {
    if (safeMethods.has(req.method)) return next();

    res.once("finish", () => {
        const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, "") || "/";
        const entry = {
            actorId: req.authUser?.id ?? null,
            actorEmail: req.authUser?.email ?? req.auditActorEmail ?? null,
            action: `${req.method} ${path}`.slice(0, 300),
            method: req.method,
            path: path.slice(0, 500),
            status: res.statusCode,
            ipAddress: req.ip?.slice(0, 100) ?? null,
            userAgent: req.get("user-agent")?.slice(0, 500) ?? null
        };
        auditService.record(entry).catch((error) => {
            console.error("[Audit] Could not persist request audit event:", error);
        });
    });
    return next();
}
