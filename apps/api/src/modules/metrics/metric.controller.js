import service from "./metric.service.js";

console.log("METRIC CONTROLLER LOADED");

class MetricController {

    async poll(req, res) {

    console.log("==== CONTROLLER ====");

    const result = await service.pollAll();

    res.json(result);

}

}

export default new MetricController();