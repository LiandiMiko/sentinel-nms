import snmp from "net-snmp";

export function createSession(ip, community = "public", port = 161, version = "2c") {

    return snmp.createSession(ip, community, {

        port,

        timeout: 3000,

        retries: 1,

        version: version === "1" ? snmp.Version1 : snmp.Version2c

    });

}