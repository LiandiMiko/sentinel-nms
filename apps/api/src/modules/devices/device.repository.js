import prisma from "../../core/database/prisma.js";

class DeviceRepository {

    async create(data) {
        return prisma.device.create({
            data
        });
    }

    async findAll() {
        return prisma.device.findMany({
            orderBy: {
                createdAt: "desc"
            }
        });
    }

}

export default new DeviceRepository();