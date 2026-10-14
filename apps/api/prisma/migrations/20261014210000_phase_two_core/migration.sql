ALTER TABLE "Device" ADD COLUMN "downSince" DATETIME;
ALTER TABLE "Device" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Device" ADD COLUMN "lastError" TEXT;
CREATE INDEX "Metric_createdAt_idx" ON "Metric"("createdAt");
CREATE INDEX "Metric_deviceId_name_createdAt_idx" ON "Metric"("deviceId", "name", "createdAt");

CREATE TABLE "DeviceGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DeviceGroup_name_key" ON "DeviceGroup"("name");

CREATE TABLE "DeviceGroupMembership" (
    "deviceId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("deviceId", "groupId"),
    CONSTRAINT "DeviceGroupMembership_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviceGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DeviceGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeviceGroupMembership_groupId_idx" ON "DeviceGroupMembership"("groupId");

CREATE TABLE "DeviceTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "DeviceTag_name_key" ON "DeviceTag"("name");

CREATE TABLE "DeviceTagAssignment" (
    "deviceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("deviceId", "tagId"),
    CONSTRAINT "DeviceTagAssignment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviceTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DeviceTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeviceTagAssignment_tagId_idx" ON "DeviceTagAssignment"("tagId");

CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "threshold" REAL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "groupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DeviceGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AlertRule_enabled_type_idx" ON "AlertRule"("enabled", "type");

CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceName" TEXT NOT NULL,
    "deviceIpAddress" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "value" TEXT,
    "state" TEXT NOT NULL DEFAULT 'open',
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "acknowledgedBy" TEXT,
    "resolvedAt" DATETIME,
    CONSTRAINT "Alert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Alert_state_triggeredAt_idx" ON "Alert"("state", "triggeredAt");
CREATE INDEX "Alert_deviceId_ruleId_state_idx" ON "Alert"("deviceId", "ruleId", "state");

CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AlertRuleChannel" (
    "ruleId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    PRIMARY KEY ("ruleId", "channelId"),
    CONSTRAINT "AlertRuleChannel_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlertRuleChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AlertRuleChannel_channelId_idx" ON "AlertRuleChannel"("channelId");
