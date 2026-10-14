CREATE TABLE "DeviceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "DeviceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DeviceEvent_deviceId_startedAt_idx" ON "DeviceEvent"("deviceId", "startedAt");
CREATE INDEX "DeviceEvent_deviceId_type_subject_resolvedAt_idx" ON "DeviceEvent"("deviceId", "type", "subject", "resolvedAt");
