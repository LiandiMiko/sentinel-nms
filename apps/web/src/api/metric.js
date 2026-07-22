import api from "./client";

export async function getCpuHistory(deviceId) {
    const res = await api.get(
        `/metrics/device/${deviceId}?name=cpu&limit=50`
    );

    return res.data.data;
}