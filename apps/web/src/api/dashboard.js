import api from "./client.js";

export async function getSummary() {
    const res = await api.get("/dashboard/summary");
    if (!res.data?.data || typeof res.data.data !== "object") {
        throw new Error("The dashboard summary response was invalid.");
    }
    return res.data.data;
}

export async function getDevices(filters = {}) {
    const res = await api.get("/dashboard/devices", { params: filters });
    if (!Array.isArray(res.data?.data)) {
        throw new Error("The device list response was invalid.");
    }
    return res.data.data;
}

export async function getOperationsHealth() {
    const res = await api.get("/dashboard/health");
    if (!res.data?.data || typeof res.data.data !== "object") {
        throw new Error("The system health response was invalid.");
    }
    return res.data.data;
}

export async function getDevice(id) {
    const res = await api.get(`/dashboard/devices/${id}`);
    if (!res.data?.data || typeof res.data.data !== "object") {
        throw new Error("The device response was invalid.");
    }
    return res.data.data;
}