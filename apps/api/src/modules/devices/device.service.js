import repository from "./device.repository.js";

class DeviceService {
    async create(data) {
        const exists = await repository.findByIp(data.ipAddress);

        if (exists) {
            const error = new Error("IP Address already exists");
            error.status = 409;
            throw error;
        }

        return repository.create(data);
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
        await this.findById(id);

        if (data.ipAddress) {
            const exists = await repository.findByIp(data.ipAddress);

            if (exists && exists.id !== id) {
                const error = new Error("IP Address already exists");
                error.status = 409;
                throw error;
            }
        }

        return repository.update(id, data);
    }

    async delete(id) {
        await this.findById(id);

        return repository.delete(id);
    }
}

export default new DeviceService();
