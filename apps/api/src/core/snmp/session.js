import snmp from "net-snmp";

export function createSession(ip, community = "public", port = 161) {

    return snmp.createSession(ip, community, {

        port,

        timeout: 3000,

        retries: 1,

        version: snmp.Version2c

    });

}