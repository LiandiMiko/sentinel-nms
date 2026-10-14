ALTER TABLE "Device" ADD COLUMN "snmpSecurityName" TEXT;
ALTER TABLE "Device" ADD COLUMN "snmpSecurityLevel" TEXT NOT NULL DEFAULT 'authPriv';
ALTER TABLE "Device" ADD COLUMN "snmpAuthProtocol" TEXT NOT NULL DEFAULT 'sha';
ALTER TABLE "Device" ADD COLUMN "snmpAuthPassword" TEXT;
ALTER TABLE "Device" ADD COLUMN "snmpPrivProtocol" TEXT NOT NULL DEFAULT 'aes';
ALTER TABLE "Device" ADD COLUMN "snmpPrivPassword" TEXT;
ALTER TABLE "Device" ADD COLUMN "routerOsPort" INTEGER NOT NULL DEFAULT 443;
