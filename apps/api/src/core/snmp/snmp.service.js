import { createSession } from "./session.js";

function normalize(value) {

    if (Buffer.isBuffer(value)) {
        return value.toString();
    }

    return value;

}

export async function get(ip, community, oid) {

    return new Promise((resolve, reject) => {

        const session = createSession(ip, community);

        session.get([oid], (error, varbinds) => {

            session.close();

            if (error) {
                return reject(error);
            }

            resolve(
                normalize(varbinds[0].value)
            );

        });

    });

}