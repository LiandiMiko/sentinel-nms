import api from "./client";

export async function getMetricHistory(deviceId, name, limit = 100, rangeSeconds) {
    const res = await api.get(`/metrics/device/${deviceId}`, {
        params: { name, limit, ...(rangeSeconds ? { rangeSeconds } : {}) }
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

export async function getDeviceMetricSummary(deviceId) {
    const res = await api.get(`/metrics/device/${deviceId}/summary`);
    if (!res.data?.data || typeof res.data.data !== "object") {
        throw new Error("The device metric summary response was invalid.");
    }
    return res.data.data;
}

export async function getDeviceEvents(deviceId) {
    const res = await api.get(`/metrics/device/${deviceId}/events`);
    if (!Array.isArray(res.data?.data)) {
        throw new Error("The device event response was invalid.");
    }
    return res.data.data;
}