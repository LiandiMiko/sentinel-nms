import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeValue } from "../src/modules/metrics/metric.service.js";
import { OID } from "../src/core/snmp/oid.js";

describe("SNMP interface traffic counters", () => {
    it("decodes variable-length Counter64 buffers as unsigned decimal values", () => {
        assert.equal(
            normalizeValue(Buffer.from("01cfb260d55e", "hex"), `${OID.ifInOctets}.2`),
            "1991562548574"
        );
        assert.equal(
            normalizeValue(Buffer.from("08b6f593823d", "hex"), `${OID.ifOutOctets}.2`),
            "9581897155133"
        );
        assert.equal(
            normalizeValue(Buffer.from("ffffffffffffffff", "hex"), `${OID.ifInOctets}.2`),
            "18446744073709551615"
        );
    });

    it("keeps unrelated SNMP octet strings as text", () => {
        assert.equal(normalizeValue(Buffer.from("Ether1"), "1.3.6.1.2.1.2.2.1.2.2"), "Ether1");
    });
});
