import snmp from "net-snmp";
import { decryptDeviceSecret } from "../utils/secret.js";

const AUTH_PROTOCOLS = {
    md5: snmp.AuthProtocols.md5,
    sha: snmp.AuthProtocols.sha,
    sha224: snmp.AuthProtocols.sha224,
    sha256: snmp.AuthProtocols.sha256,
    sha384: snmp.AuthProtocols.sha384,
    sha512: snmp.AuthProtocols.sha512
};

const PRIV_PROTOCOLS = {
    des: snmp.PrivProtocols.des,
    aes: snmp.PrivProtocols.aes,
    aes256b: snmp.PrivProtocols.aes256b,
    aes256r: snmp.PrivProtocols.aes256r
};

export function createSession(ip, community = "public", port = 161, version = "2c", security = {}, overrides = {}) {
    const options = { port, timeout: 3000, retries: 1, ...overrides };
    if (version === "3") {
        const user = {
            name: security.snmpSecurityName,
            level: snmp.SecurityLevel[security.snmpSecurityLevel]
        };
        if (security.snmpSecurityLevel !== "noAuthNoPriv") {
            user.authProtocol = AUTH_PROTOCOLS[security.snmpAuthProtocol];
            user.authKey = decryptDeviceSecret(security.snmpAuthPassword);
        }
        if (security.snmpSecurityLevel === "authPriv") {
            user.privProtocol = PRIV_PROTOCOLS[security.snmpPrivProtocol];
            user.privKey = decryptDeviceSecret(security.snmpPrivPassword);
        }
        return snmp.createV3Session(ip, user, options);
    }
    return snmp.createSession(ip, community, {
        ...options,
        version: version === "1" ? snmp.Version1 : snmp.Version2c
    });
}