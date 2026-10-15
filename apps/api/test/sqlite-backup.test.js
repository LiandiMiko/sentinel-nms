import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createSQLiteBackup, pruneSQLiteBackups } from "../src/modules/scheduler/sqlite-backup.service.js";

const temporaryDirectories = [];

async function createTemporaryDirectory() {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-backup-test-"));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
        recursive: true,
        force: true
    })));
});

describe("SQLite backup service", () => {
    it("creates a dated backup using SQLite's online backup operation", async () => {
        const directory = await createTemporaryDirectory();
        const now = new Date("2026-10-15T02:30:45.123Z");
        const client = {
            async $executeRaw(strings, backupPath) {
                assert.match(strings.join("?"), /^VACUUM INTO \?$/);
                await writeFile(backupPath, "snapshot");
                return 0;
            }
        };

        const backupPath = await createSQLiteBackup({ client, directory, now });
        assert.equal(backupPath.backupPath, join(directory, "sentinel-20261015.db"));
        assert.equal(backupPath.created, true);
        assert.equal(await readFile(backupPath.backupPath, "utf8"), "snapshot");
    });

    it("does not create another backup when today's backup already exists", async () => {
        const directory = await createTemporaryDirectory();
        const existingPath = join(directory, "sentinel-20261015.db");
        await writeFile(existingPath, "snapshot");
        const client = {
            async $executeRaw() {
                assert.fail("Today's existing backup should be reused.");
            }
        };

        assert.deepEqual(await createSQLiteBackup({
            client,
            directory,
            now: new Date("2026-10-15T02:30:45.123Z")
        }), { backupPath: existingPath, created: false });
    });

    it("restores a real SQLite backup and verifies the restored database contents", async () => {
        const directory = await createTemporaryDirectory();
        const sourcePath = join(directory, "source.db");
        const restoredPath = join(directory, "restored.db");
        const sourceDb = new DatabaseSync(sourcePath);
        sourceDb.exec(`
            CREATE TABLE "RestoreFixture" ("id" TEXT PRIMARY KEY, "value" TEXT NOT NULL);
            INSERT INTO "RestoreFixture" VALUES ('fixture-1', 'backup data');
        `);
        sourceDb.close();

        const client = new PrismaClient({
            datasources: { db: { url: `file:${sourcePath.replace(/\\/g, "/")}` } },
            log: ["error"]
        });
        let backupPath;
        try {
            ({ backupPath } = await createSQLiteBackup({
                client,
                directory: join(directory, "backups"),
                now: new Date("2026-10-15T02:30:45.123Z")
            }));
        } finally {
            await client.$disconnect();
        }

        await copyFile(backupPath, restoredPath);
        const restoredDb = new DatabaseSync(restoredPath, { readOnly: true });
        try {
            assert.equal(restoredDb.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
            const [restoredRow] = restoredDb.prepare("SELECT * FROM RestoreFixture").all();
            assert.equal(restoredRow.id, "fixture-1");
            assert.equal(restoredRow.value, "backup data");
        } finally {
            restoredDb.close();
        }
    });

    it("removes only expired Sentinel backups and leaves unrelated files untouched", async () => {
        const directory = await createTemporaryDirectory();
        const oldBackup = join(directory, "sentinel-20261001.db");
        const recentBackup = join(directory, "sentinel-20261014.db");
        const unrelatedFile = join(directory, "other.db");
        await Promise.all([
            writeFile(oldBackup, "old"),
            writeFile(recentBackup, "recent"),
            writeFile(unrelatedFile, "unrelated")
        ]);
        const oldTime = new Date("2026-10-01T00:00:00Z");
        await utimes(oldBackup, oldTime, oldTime);

        assert.equal(await pruneSQLiteBackups({
            directory,
            days: 7,
            now: new Date("2026-10-15T00:00:00Z")
        }), 1);
        await assert.rejects(readFile(oldBackup));
        assert.equal(await readFile(recentBackup, "utf8"), "recent");
        assert.equal(await readFile(unrelatedFile, "utf8"), "unrelated");
    });
});
