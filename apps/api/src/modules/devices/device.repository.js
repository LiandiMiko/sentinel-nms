import prisma from "../../core/database/prisma.js";

class DeviceRepository {

    async create(data) {

        console.log("===== CREATE DEVICE =====");
        console.log("DATABASE =", process.env.DATABASE_URL);

        const tables = await prisma.$queryRawUnsafe(
            "SELECT name FROM sqlite_master WHERE type='table';"
        );

        console.log("TABLES =", tables);

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

    async findByIp(ipAddress) {

        console.log("===== FIND BY IP =====");
        console.log(ipAddress);

        const tables = await prisma.$queryRawUnsafe(
            "SELECT name FROM sqlite_master WHERE type='table';"
        );

        console.log("TABLES =", tables);

        return prisma.device.findUnique({
            where: {
                ipAddress
            }
        });

    }

}

export default new DeviceRepository();