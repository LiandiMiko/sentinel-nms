import prisma from "../../core/database/prisma.js";
import deviceService from "./device.service.js";

class GroupService {
    async list() {
        const [groups, tags] = await Promise.all([
            prisma.deviceGroup.findMany({
                include: { _count: { select: { devices: true } } },
                orderBy: { name: "asc" }
            }),
            prisma.deviceTag.findMany({
                include: { _count: { select: { devices: true } } },
                orderBy: { name: "asc" }
            })
        ]);
        return { groups, tags };
    }

    async create(data) {
        return prisma.deviceGroup.create({ data });
    }

    async update(id, data) {
        await this.requireGroup(id);
        return prisma.deviceGroup.update({ where: { id }, data });
    }

    async delete(id) {
        await this.requireGroup(id);
        return prisma.deviceGroup.delete({ where: { id } });
    }

    async assign(deviceId, data) {
        await deviceService.findById(deviceId);
        const groups = [...new Set(data.groups.map((name) => name.trim()).filter(Boolean))];
        const tags = [...new Set(data.tags.map((name) => name.trim()).filter(Boolean))];
        const invalidName = [...groups, ...tags].find((name) => name.length > 40);
        if (invalidName) {
            const error = new Error("Group and tag names must be 40 characters or fewer");
            error.status = 400;
            throw error;
        }

        return prisma.$transaction(async (tx) => {
            const groupRecords = await Promise.all(groups.map((name) => tx.deviceGroup.upsert({
                where: { name },
                update: {},
                create: { name }
            })));
            const tagRecords = await Promise.all(tags.map((name) => tx.deviceTag.upsert({
                where: { name },
                update: {},
                create: { name }
            })));

            await tx.deviceGroupMembership.deleteMany({ where: { deviceId } });
            await tx.deviceTagAssignment.deleteMany({ where: { deviceId } });
            if (groupRecords.length) {
                await tx.deviceGroupMembership.createMany({
                    data: groupRecords.map(({ id }) => ({ deviceId, groupId: id }))
                });
            }
            if (tagRecords.length) {
                await tx.deviceTagAssignment.createMany({
                    data: tagRecords.map(({ id }) => ({ deviceId, tagId: id }))
                });
            }
            return { groups, tags };
        });
    }

    async requireGroup(id) {
        const group = await prisma.deviceGroup.findUnique({ where: { id } });
        if (!group) {
            const error = new Error("Device group not found");
            error.status = 404;
            throw error;
        }
        return group;
    }
}

export default new GroupService();
