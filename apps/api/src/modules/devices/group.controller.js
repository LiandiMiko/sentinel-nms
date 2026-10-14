import { z } from "zod";
import { success } from "../../core/response/response.js";
import groupService from "./group.service.js";

const groupSchema = z.object({
    name: z.string().trim().min(1).max(40),
    description: z.string().trim().max(250).optional().nullable()
}).strict();

const assignmentSchema = z.object({
    groups: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([])
}).strict();

class GroupController {
    async list(req, res) {
        return success(res, await groupService.list());
    }

    async create(req, res) {
        return success(res, await groupService.create(groupSchema.parse(req.body)), "Group created", 201);
    }

    async update(req, res) {
        return success(res, await groupService.update(req.params.id, groupSchema.partial().parse(req.body)));
    }

    async delete(req, res) {
        await groupService.delete(req.params.id);
        return success(res, null, "Group deleted");
    }

    async assign(req, res) {
        const payload = assignmentSchema.parse(req.body);
        return success(res, await groupService.assign(req.params.id, payload), "Device organization updated");
    }
}

export default new GroupController();
