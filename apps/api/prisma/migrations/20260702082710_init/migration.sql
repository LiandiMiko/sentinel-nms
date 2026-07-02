-- CreateTable
CREATE TABLE "Device" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_ipAddress_key" ON "Device"("ipAddress");
