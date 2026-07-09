import metricService from "./metric.service.js";


class MetricController {

    async poll(req, res) {
        const result = await metricService.pollAll();

        res.json({
            success: true,
            message: "Metrics polled successfully",
            data: result
        });
    }

    async history(req, res) {
        const { deviceId, metric } = req.params;
        const { limit = 100 } = req.query;

        const history = await metricService.getHistory(
            deviceId,
            metric,
            limit
        );

        res.json({
            success: true,
            data: history
        });
    }
}

export default new MetricController();