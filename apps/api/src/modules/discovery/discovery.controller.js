import { z } from "zod";
import { success } from "../../core/response/response.js";
import discoveryService from "./discovery.service.js";

const scanSchema = z.object({
    cidr: z.string().min(1).max(18),
    community: z.string().min(1).max(128).default("public"),
    port: z.coerce.number().int().min(1).max(65535).default(161),
    version: z.enum(["1", "2c"]).default("2c")
}).strict();

class DiscoveryController {
    async scan(req, res) {
        const payload = scanSchema.parse(req.body);
        return success(res, await discoveryService.scan(payload), "SNMP discovery completed");
    }
}

export default new DiscoveryController();
