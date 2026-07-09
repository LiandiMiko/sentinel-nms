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

    async findEnabled() {
        return prisma.device.findMany({
            where: {
                enabled: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    async findById(id) {
        return prisma.device.findUnique({
            where: {
                id
            }
        });
    }

    async findByIp(ipAddress) {
        return prisma.device.findUnique({
            where: {
                ipAddress
            }
        });
    }

    async update(id, data) {
        return prisma.device.update({
            where: {
                id
            },
            data
        });
    }

    async delete(id) {
        return prisma.device.delete({
            where: {
                id
            }
        });
    }
}

export default new DeviceRepository();
