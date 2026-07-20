/*
  Warnings:

  - You are about to drop the column `lastError` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Device` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "snmpPort" INTEGER NOT NULL DEFAULT 161,
    "snmpVersion" TEXT NOT NULL DEFAULT '2c',
    "community" TEXT NOT NULL,
    "apiPort" INTEGER NOT NULL DEFAULT 8728,
    "username" TEXT,
    "password" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Device" ("apiPort", "community", "createdAt", "enabled", "id", "ipAddress", "lastSeen", "name", "password", "snmpPort", "snmpVersion", "updatedAt", "username") SELECT "apiPort", "community", "createdAt", "enabled", "id", "ipAddress", "lastSeen", "name", "password", "snmpPort", "snmpVersion", "updatedAt", "username" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE UNIQUE INDEX "Device_ipAddress_key" ON "Device"("ipAddress");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
