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
        const { name = "cpu", limit = 100, rangeSeconds } = req.query;

        const data = await metricService.getHistory(
            id,
            name,
            limit,
            rangeSeconds ?? null
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

    async summary(req, res) {
        const data = await metricService.getSummary(req.params.id);
        res.json({ success: true, data });
    }

    async events(req, res) {
        const data = await metricService.getEvents(req.params.id);
        res.json({ success: true, data });
    }

}

export default new MetricController();