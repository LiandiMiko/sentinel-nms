-- CreateTable
CREATE TABLE "DeviceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "hostname" TEXT,
    "uptime" TEXT,
    "cpu" TEXT,
    "lastSeen" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceSnapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSnapshot_deviceId_key" ON "DeviceSnapshot"("deviceId");
