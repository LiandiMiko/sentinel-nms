import { z } from "zod";
import { success } from "../../core/response/response.js";
import authService, { SESSION_DURATION_MS } from "./auth.service.js";
import { SESSION_COOKIE, readSessionCookie } from "./auth.middleware.js";
import env from "../../core/config/env.js";

const loginSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128)
}).strict();

const createUserSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(12).max(128),
    role: z.enum(["ADMIN", "VIEWER"])
}).strict();

const updateUserSchema = z.object({
    enabled: z.boolean().optional()
}).strict().refine((values) => Object.keys(values).length > 0, {
    message: "At least one supported user property must be provided."
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128)
}).strict();

function setSessionCookie(res, token, expiresAt) {
    const options = [
        `${SESSION_COOKIE}=${token}`,
        "Path=/api/v1",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
        `Expires=${expiresAt.toUTCString()}`
    ];
    if (env.authCookieSecure) options.push("Secure");
    res.setHeader("Set-Cookie", options.join("; "));
}

function clearSessionCookie(res) {
    const options = [`${SESSION_COOKIE}=`, "Path=/api/v1", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
    if (env.authCookieSecure) options.push("Secure");
    res.setHeader("Set-Cookie", options.join("; "));
}

class AuthController {
    async login(req, res) {
        const input = loginSchema.parse(req.body);
        const session = await authService.login(input.email, input.password);
        setSessionCookie(res, session.token, session.expiresAt);
        return success(res, { user: session.user }, "Signed in");
    }

    async me(req, res) {
        return success(res, { user: req.authUser });
    }

    async logout(req, res) {
        await authService.logout(readSessionCookie(req));
        clearSessionCookie(res);
        return success(res, null, "Signed out");
    }

    async listUsers(req, res) {
        return success(res, await authService.listUsers());
    }

    async createUser(req, res) {
        const input = createUserSchema.parse(req.body);
        return success(res, await authService.createUser(input), "User created", 201);
    }

    async updateUser(req, res) {
        const values = updateUserSchema.parse(req.body);
        return success(res, await authService.updateUser(req.params.id, values, req.authUser.id), "User updated");
    }

    async deleteUser(req, res) {
        await authService.deleteUser(req.params.id, req.authUser.id);
        return success(res, null, "User deleted");
    }

    async changePassword(req, res) {
        const values = changePasswordSchema.parse(req.body);
        await authService.changePassword(
            req.authUser.id,
            req.authSessionId,
            values.currentPassword,
            values.newPassword
        );
        return success(res, null, "Password changed");
    }
}

export default new AuthController();
