import { chmod, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../../core/database/prisma.js";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const backupDirectory = resolve(apiDirectory, process.env.SQLITE_BACKUP_DIR || "backups");
const retentionDays = Number(process.env.SQLITE_BACKUP_RETENTION_DAYS || 7);

if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error("SQLITE_BACKUP_RETENTION_DAYS must be an integer between 1 and 3650.");
}

const backupFileName = (date) => `sentinel-${date.toISOString().slice(0, 10).replace(/-/g, "")}.db`;

export async function createSQLiteBackup({
    client = prisma,
    directory = backupDirectory,
    now = new Date()
} = {}) {
    const targetDirectory = isAbsolute(directory) ? directory : resolve(apiDirectory, directory);
    await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
    const backupPath = join(targetDirectory, backupFileName(now));
    try {
        const existingBackup = await stat(backupPath);
        if (existingBackup.isFile() && existingBackup.size > 0) {
            return { backupPath, created: false };
        }
        await unlink(backupPath);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    try {
        await client.$executeRaw`VACUUM INTO ${backupPath}`;
        await chmod(backupPath, 0o600);
        const backup = await stat(backupPath);
        if (!backup.isFile() || backup.size === 0) {
            throw new Error("SQLite backup file is empty or invalid.");
        }
    } catch (error) {
        try {
            await unlink(backupPath);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                throw new AggregateError([error, cleanupError], "SQLite backup failed and the partial backup could not be removed.");
            }
        }
        throw new Error("Could not create the SQLite backup.", { cause: error });
    }
    return { backupPath, created: true };
}

export async function pruneSQLiteBackups({
    directory = backupDirectory,
    days = retentionDays,
    now = new Date()
} = {}) {
    const targetDirectory = isAbsolute(directory) ? directory : resolve(apiDirectory, directory);
    let entries;
    try {
        entries = await readdir(targetDirectory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return 0;
        throw error;
    }

    const cutoff = now.getTime() - days * 86400_000;
    let removed = 0;
    for (const entry of entries) {
        if (!entry.isFile() || !/^sentinel-\d{8}(?:T\d{6}Z)?\.db$/.test(entry.name)) continue;
        const backupPath = join(targetDirectory, entry.name);
        if ((await stat(backupPath)).mtimeMs >= cutoff) continue;
        await unlink(backupPath);
        removed += 1;
    }
    return removed;
}

export default { createSQLiteBackup, pruneSQLiteBackups };
