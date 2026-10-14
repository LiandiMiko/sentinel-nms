import repository from "./device.repository.js";
import { encryptDeviceSecret } from "../../core/utils/secret.js";

class DeviceService {
    async create(data) {
        const exists = await repository.findByIp(data.ipAddress);

        if (exists) {
            const error = new Error("IP Address already exists");
            error.status = 409;
            throw error;
        }

        this.validateSnmpSecurity(data);
        return repository.create(this.protectSecrets(data));
    }

    async findAll() {
        return repository.findAll();
    }

    async findById(id) {
        const device = await repository.findById(id);

        if (!device) {
            const error = new Error("Device not found");
            error.status = 404;
            throw error;
        }

        return device;
    }

    async update(id, data) {
        const current = await this.findById(id);

        if (data.ipAddress) {
            const exists = await repository.findByIp(data.ipAddress);

            if (exists && exists.id !== id) {
                const error = new Error("IP Address already exists");
                error.status = 409;
                throw error;
            }
        }

        this.validateSnmpSecurity({ ...current, ...data });
        return repository.update(id, this.protectSecrets(data));
    }

    validateSnmpSecurity(device) {
        if (device.snmpVersion !== "3") return;
        const missingUsername = !device.snmpSecurityName;
        const missingAuth = device.snmpSecurityLevel !== "noAuthNoPriv"
            && !device.snmpAuthPassword;
        const missingPrivacy = device.snmpSecurityLevel === "authPriv"
            && !device.snmpPrivPassword;
        if (missingUsername || missingAuth || missingPrivacy) {
            const error = new Error("SNMPv3 security name and required authentication/privacy credentials must be configured.");
            error.status = 400;
            throw error;
        }
    }

    protectSecrets(data) {
        const protectedData = { ...data };
        for (const key of ["password", "snmpAuthPassword", "snmpPrivPassword"]) {
            if (protectedData[key]) protectedData[key] = encryptDeviceSecret(protectedData[key]);
        }
        return protectedData;
    }

    async delete(id) {
        await this.findById(id);

        return repository.delete(id);
    }
}

export default new DeviceService();
