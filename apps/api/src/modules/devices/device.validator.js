import { z } from "zod";

export const createDeviceSchema = z.object({

    name: z.string().min(3),

    ipAddress: z.string().min(7).max(15),

    community: z.string().min(1),

    snmpPort: z.coerce.number().default(161),

    apiPort: z.coerce.number().default(8728)

});