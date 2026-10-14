import service from "./device.service.js";
import { createDeviceSchema, updateDeviceSchema } from "./device.validator.js";
import { success } from "../../core/response/response.js";

const withoutCredentials = ({ community, password, ...device }) => device;

class DeviceController {
    async create(req, res) {
        const payload = createDeviceSchema.parse(req.body);
        const device = await service.create(payload);

        return success(res, withoutCredentials(device), "Device created successfully", 201);
    }

    async findAll(req, res) {
        const devices = await service.findAll();

        return success(
            res,
            devices.map(withoutCredentials),
            "Devices retrieved successfully"
        );
    }

    async findById(req, res) {
        const device = await service.findById(req.params.id);

        return success(res, withoutCredentials(device), "Device retrieved successfully");
    }

    async update(req, res) {
        const payload = updateDeviceSchema.parse(req.body);
        const device = await service.update(req.params.id, payload);

        return success(res, withoutCredentials(device), "Device updated successfully");
    }

    async delete(req, res) {
        await service.delete(req.params.id);

        return success(res, null, "Device deleted successfully");
    }
}

export default new DeviceController();