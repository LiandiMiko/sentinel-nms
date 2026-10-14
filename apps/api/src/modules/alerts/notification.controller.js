import { z } from "zod";
import { success } from "../../core/response/response.js";
import notificationService from "./notification.service.js";
import { createChannelSchema, updateChannelSchema } from "./notification.validator.js";

class NotificationController {
    async list(req, res) {
        return success(res, await notificationService.list());
    }

    async create(req, res) {
        return success(
            res,
            await notificationService.create(createChannelSchema.parse(req.body)),
            "Notification channel created",
            201
        );
    }

    async update(req, res) {
        return success(
            res,
            await notificationService.update(req.params.id, updateChannelSchema.parse(req.body))
        );
    }

    async remove(req, res) {
        await notificationService.delete(req.params.id);
        return success(res, null, "Notification channel deleted");
    }

    async test(req, res) {
        z.object({ id: z.string().min(1) }).parse(req.body);
        return success(res, await notificationService.test(req.body.id), "Test notification sent");
    }
}

export default new NotificationController();
