import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import prisma from "../../core/database/prisma.js";
import env from "../../core/config/env.js";

const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const DUMMY_BCRYPT_HASH = "$2b$12$YDhYsrJM7tPyZHUBkxR2neadCw.yD9H0cX6yEVOwFaR50pXrMhuLK";
const BCRYPT_HASH_PREFIX = `bcrypt-sha256$${BCRYPT_ROUNDS}$`;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const normalizeEmail = (email) => email.trim().toLowerCase();
const bcryptInput = (password) => createHash("sha256")
    .update("sentinel-nms:bcrypt-password:v1\0")
    .update(password, "utf8")
    .digest("hex");
const publicUser = ({ id, email, role, enabled, createdAt, updatedAt }) => ({
    id, email, role, enabled, createdAt, updatedAt
});

export async function hashPassword(password) {
    const hash = await bcrypt.hash(bcryptInput(password), BCRYPT_ROUNDS);
    return `${BCRYPT_HASH_PREFIX}${hash}`;
}

export async function verifyPassword(password, passwordHash) {
    if (passwordHash?.startsWith(BCRYPT_HASH_PREFIX)) {
        const bcryptHash = passwordHash.slice(BCRYPT_HASH_PREFIX.length);
        if (!/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(bcryptHash)) return false;
        return bcrypt.compare(bcryptInput(password), bcryptHash);
    }

    const [algorithm, n, r, p, salt, expectedHex] = (passwordHash || "").split("$");
    if (
        algorithm !== "scrypt" ||
        n !== "16384" ||
        r !== "8" ||
        p !== "1" ||
        !/^[a-f0-9]{32}$/i.test(salt || "") ||
        !/^[a-f0-9]{128}$/i.test(expectedHex || "")
    ) {
        await bcrypt.compare(bcryptInput(password), DUMMY_BCRYPT_HASH);
        return false;
    }
    const actual = await scrypt(password, salt, 64, {
        N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
    });
    return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

class AuthService {
    async initialize() {
        await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
        const userCount = await prisma.user.count();
        if (userCount > 0) return;

        const email = env.initialAdminEmail;
        const password = env.initialAdminPassword;
        if (!email || !password) {
            throw new Error(
                "No users exist. Set AUTH_INITIAL_ADMIN_EMAIL and AUTH_INITIAL_ADMIN_PASSWORD to create the initial Super Admin."
            );
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
            throw new Error("Initial admin credentials are invalid; use a valid email and a password of 12–128 characters.");
        }

        await prisma.user.create({
            data: { email, passwordHash: await hashPassword(password), role: "SUPER_ADMIN" }
        });
        console.info("[Auth] Initial Super Admin account created.");
    }

    async login(emailInput, password) {
        const email = normalizeEmail(emailInput);
        const user = await prisma.user.findUnique({ where: { email } });
        const passwordMatches = await verifyPassword(password, user?.passwordHash);
        if (!user || !user.enabled || !passwordMatches) {
            throw httpError(401, "Invalid email or password.");
        }
        if (user.passwordHash.startsWith("scrypt$")) {
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: await hashPassword(password) }
            });
        }

        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
        await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
        const session = await prisma.session.create({
            data: { tokenHash: hashToken(token), userId: user.id, expiresAt }
        });
        return { token, expiresAt, user: publicUser(user), sessionId: session.id };
    }

    async authenticate(token) {
        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
        const session = await prisma.session.findUnique({
            where: { tokenHash: hashToken(token) },
            include: { user: true }
        });
        if (!session || session.expiresAt <= new Date() || !session.user.enabled) return null;
        return { user: publicUser(session.user), sessionId: session.id };
    }

    async logout(token) {
        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
        await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }

    async listUsers() {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, role: true, enabled: true, createdAt: true, updatedAt: true },
            orderBy: { createdAt: "asc" }
        });
        return users;
    }

    async createUser({ email, password, role }) {
        try {
            const user = await prisma.user.create({
                data: { email: normalizeEmail(email), passwordHash: await hashPassword(password), role }
            });
            return publicUser(user);
        } catch (error) {
            if (error.code === "P2002") throw httpError(409, "A user with this email already exists.");
            throw error;
        }
    }

    async updateUser(id, values, actingUserId) {
        if (id === actingUserId && values.enabled === false) {
            throw httpError(400, "You cannot disable your own account.");
        }
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing || existing.role === "SUPER_ADMIN") throw httpError(404, "User not found.");
        const user = await prisma.user.update({ where: { id }, data: values });
        if (values.enabled === false) {
            await prisma.session.deleteMany({ where: { userId: id } });
        }
        return publicUser(user);
    }

    async deleteUser(id, actingUserId) {
        if (id === actingUserId) throw httpError(400, "You cannot delete your own account.");
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user || user.role === "SUPER_ADMIN") throw httpError(404, "User not found.");
        await prisma.user.delete({ where: { id } });
    }

    async changePassword(userId, sessionId, currentPassword, newPassword) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !await verifyPassword(currentPassword, user.passwordHash)) {
            throw httpError(400, "Current password is incorrect.");
        }
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: await hashPassword(newPassword) }
        });
        await prisma.session.deleteMany({ where: { userId, id: { not: sessionId } } });
    }
}

export { SESSION_DURATION_MS, hashToken, publicUser };
export default new AuthService();
