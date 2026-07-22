import service from "./device.service.js";
import { createDeviceSchema, updateDeviceSchema } from "./device.validator.js";
import { success } from "../../core/response/response.js";

class DeviceController {
    async create(req, res) {
        const payload = createDeviceSchema.parse(req.body);
        const device = await service.create(payload);

        return success(res, device, "Device created successfully", 201);
    }

    async findAll(req, res) {
        const devices = await service.findAll();

        return success(res, devices, "Devices retrieved successfully");
    }

    async findById(req, res) {
        const device = await service.findById(req.params.id);

        return success(res, device, "Device retrieved successfully");
    }

    async update(req, res) {
        const payload = updateDeviceSchema.parse(req.body);
        const device = await service.update(req.params.id, payload);

        return success(res, device, "Device updated successfully");
    }

    async delete(req, res) {
        await service.delete(req.params.id);

        return success(res, null, "Device deleted successfully");
    }
}

export default new DeviceController();