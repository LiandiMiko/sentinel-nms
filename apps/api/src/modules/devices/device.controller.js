import service from "./device.service.js";
import { createDeviceSchema } from "./device.validator.js";
import { success, error } from "../../core/response/response.js";

class DeviceController {

    async create(req, res) {

        try {

            const payload = createDeviceSchema.parse(req.body);

            const device = await service.create(payload);

            return success(
                res,
                device,
                "Device created successfully",
                201
            );

        } catch (err) {

            return error(
                res,
                err.message,
                400
            );

        }

    }

    async findAll(req, res) {

    try {

        const devices = await service.findAll();

        return success(
            res,
            devices,
            "Devices retrieved successfully"
        );

    } catch (err) {

        return error(
            res,
            err.message
        );

    }

}
}

export default new DeviceController();