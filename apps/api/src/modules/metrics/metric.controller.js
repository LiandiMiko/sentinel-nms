import metricService from "./metric.service.js";
import pollJobService from "../scheduler/poll-job.service.js";


class MetricController {

    async poll(req, res) {
        const job = await pollJobService.enqueue();
        res.status(202).json({
            success: true,
            message: "Polling job queued.",
            data: job
        });
    }

    async pollStatus(req, res) {
        const job = await pollJobService.get(req.params.id);
        if (!job) {
            const error = new Error("Polling job not found.");
            error.status = 404;
            throw error;
        }
        res.json({ success: true, data: job });
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