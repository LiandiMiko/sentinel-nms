import service from "./metric.service.js";
import { success } from "../../core/response/response.js";

class MetricController {
    async poll(req, res) {
        const result = await service.pollAll();

        return success(res, result, "Metrics polled successfully");
    }
}

export default new MetricController();
