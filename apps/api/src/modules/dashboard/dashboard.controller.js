import { z } from "zod";
import dashboardService from "./dashboard.service.js";
import { success } from "../../core/response/response.js";

const deviceFilters = z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(["UP", "DOWN", "DISABLED", "ALL"]).optional(),
    groupId: z.string().min(1).optional(),
    tagId: z.string().min(1).optional()
}).strict();

class DashboardController {

    async devices(req, res) {

        const filters = deviceFilters.parse(req.query);
        const data = await dashboardService.devices(filters);

        res.json({
            success: true,
            data
        });

    }

    async summary(req, res) {

    const data = await dashboardService.summary();

    res.json({
        success: true,
        data
    });

}

    async getDevice(req, res) {
    const data = await dashboardService.getDevice(req.params.id);

    return success(res, data);
}

    async operationsHealth(req, res) {
        return success(res, await dashboardService.operationsHealth());
    }

}

export default new DashboardController();