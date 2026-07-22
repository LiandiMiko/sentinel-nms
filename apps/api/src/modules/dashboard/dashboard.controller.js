import dashboardService from "./dashboard.service.js";
import { success } from "../../core/response/response.js";

class DashboardController {

    async devices(req, res) {

        const data = await dashboardService.devices();

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

}

export default new DashboardController();