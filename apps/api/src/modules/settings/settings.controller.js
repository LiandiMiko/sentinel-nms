import { z } from "zod";
import { success } from "../../core/response/response.js";
import settingsService from "./settings.service.js";

const updateSchema = z.object({
    pollingIntervalSeconds: z.coerce.number().int().min(15).max(3600).optional(),
    retentionEnabled: z.boolean().optional(),
    retentionDays: z.coerce.number().int().min(1).max(3650).optional()
}).strict().refine((values) => Object.keys(values).length > 0, {
    message: "At least one setting must be provided"
});

class SettingsController {
    async get(req, res) {
        return success(res, await settingsService.get());
    }

    async update(req, res) {
        const values = updateSchema.parse(req.body);
        return success(res, await settingsService.update(values), "Settings updated");
    }
}

export default new SettingsController();
