import api from "./client";

export async function getMetricHistory(deviceId, name, limit = 100) {
    const res = await api.get(`/metrics/device/${deviceId}`, {
        params: { name, limit }
    });
    if (!Array.isArray(res.data?.data)) {
        throw new Error("The metric history response was invalid.");
    }
    return res.data.data;
}

export async function getInterfaces(deviceId) {
    const res = await api.get(`/metrics/device/${deviceId}/interfaces`);
    if (!Array.isArray(res.data?.data)) {
        throw new Error("The interface list response was invalid.");
    }
    return res.data.data;
}