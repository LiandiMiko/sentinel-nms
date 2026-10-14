import { z } from "zod";
import { success } from "../../core/response/response.js";
import auditService from "./audit.service.js";

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0)
});

class AuditController {
    async list(req, res) {
        return success(res, await auditService.list(querySchema.parse(req.query)));
    }
}

export default new AuditController();
