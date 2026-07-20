import dashboardService from "./dashboard.service.js";

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

}

export default new DashboardController();