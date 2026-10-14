import { success } from "../../core/response/response.js";
import alertService from "./alert.service.js";
import { createRuleSchema, eventQuerySchema, updateRuleSchema } from "./alert.validator.js";

class AlertController {
    async listRules(req, res) {
        return success(res, await alertService.listRules());
    }

    async createRule(req, res) {
        return success(res, await alertService.createRule(createRuleSchema.parse(req.body)), "Alert rule created", 201);
    }

    async updateRule(req, res) {
        return success(res, await alertService.updateRule(
            req.params.id,
            updateRuleSchema.parse(req.body)
        ));
    }

    async deleteRule(req, res) {
        await alertService.deleteRule(req.params.id);
        return success(res, null, "Alert rule deleted");
    }

    async listEvents(req, res) {
        return success(res, await alertService.listEvents(eventQuerySchema.parse(req.query)));
    }

    async acknowledge(req, res) {
        const alert = await alertService.acknowledge(req.params.id);
        return success(res, alert, "Alert acknowledged");
    }
}

export default new AlertController();
