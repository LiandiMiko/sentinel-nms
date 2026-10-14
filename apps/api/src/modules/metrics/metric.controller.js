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
        const { id } = req.params;
        const { name = "cpu", limit = 100 } = req.query;

        const data = await metricService.getHistory(
            id,
            name,
            limit
        );

        res.json({
            success: true,
            data
        });
    }

    async interfaces(req, res) {
        const data = await metricService.getInterfaces(req.params.id);
        res.json({ success: true, data });
    }

}

export default new MetricController();