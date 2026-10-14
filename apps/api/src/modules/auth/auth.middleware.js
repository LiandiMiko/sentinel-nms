import authService from "./auth.service.js";

export const SESSION_COOKIE = "sentinel_session";
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function readSessionCookie(req) {
    const entry = req.headers.cookie?.split(";").map((part) => part.trim())
        .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    return entry?.slice(SESSION_COOKIE.length + 1) || "";
}

export async function authenticate(req, res, next) {
    try {
        const authentication = await authService.authenticate(readSessionCookie(req));
        if (!authentication) {
            return res.status(401).json({ success: false, message: "Authentication required.", errors: null });
        }
        req.authUser = authentication.user;
        req.authSessionId = authentication.sessionId;
        return next();
    } catch (error) {
        return next(error);
    }
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.authUser || !roles.includes(req.authUser.role)) {
            return res.status(403).json({ success: false, message: "Insufficient permissions.", errors: null });
        }
        return next();
    };
}

export function enforceRolePermissions(req, res, next) {
    if (!safeMethods.has(req.method) && req.authUser.role === "VIEWER") {
        return res.status(403).json({ success: false, message: "Viewer accounts have read-only access.", errors: null });
    }
    if (req.path.startsWith("/settings") && !safeMethods.has(req.method) && req.authUser.role !== "SUPER_ADMIN") {
        return res.status(403).json({ success: false, message: "Only Super Admin can change system settings.", errors: null });
    }
    return next();
}

export function createLoginRateLimiter({ windowMs = 15 * 60 * 1000, maxAttempts = 10 } = {}) {
    const attemptsByIp = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || "unknown";
        let bucket = attemptsByIp.get(key);
        if (!bucket || bucket.resetAt <= now) {
            if (!bucket && attemptsByIp.size >= 10000) {
                attemptsByIp.delete(attemptsByIp.keys().next().value);
            }
            bucket = { count: 0, resetAt: now + windowMs };
            attemptsByIp.set(key, bucket);
        }
        bucket.count += 1;
        if (bucket.count > maxAttempts) {
            res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
            return res.status(429).json({ success: false, message: "Too many login attempts. Try again later.", errors: null });
        }
        return next();
    };
}

export function csrfProtection(allowedOrigins) {
    return (req, res, next) => {
        if (safeMethods.has(req.method)) return next();
        const origin = req.get("origin");
        if (!origin || !allowedOrigins.has(origin)) {
            return res.status(403).json({ success: false, message: "Request origin is not allowed.", errors: null });
        }
        return next();
    };
}
