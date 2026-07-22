import api from "./client.js";

export async function getSummary() {
    const res = await api.get("/dashboard/summary");
    return res.data.data;
}

export async function getDevices() {
    const res = await api.get("/dashboard/devices");
    return res.data.data;
}

export async function getDevice(id) {
    const res = await api.get(`/dashboard/devices/${id}`);
    return res.data.data;
}