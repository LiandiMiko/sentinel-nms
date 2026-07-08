import repository from "./device.repository.js";

class DeviceService {

    async create(data) {

        const exists = await repository.findByIp(data.ipAddress);

        if (exists) {
            throw new Error("IP Address already exists");
        }

        return repository.create(data);

    }
    
    async findAll() {
        return repository.findAll();
    }

}

export default new DeviceService();