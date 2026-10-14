import api from "./client";

export async function getSettings() {
    const response = await api.get("/settings");
    return response.data.data;
}

export async function updateSettings(settings) {
    const response = await api.patch("/settings", settings);
    return response.data.data;
}

export async function getGroups() {
    const response = await api.get("/groups");
    return response.data.data;
}

export async function createGroup(group) {
    const response = await api.post("/groups", group);
    return response.data.data;
}

export async function deleteGroup(id) {
    await api.delete(`/groups/${id}`);
}

export async function getAlertRules() {
    const response = await api.get("/alerts/rules");
    return response.data.data;
}

export async function createAlertRule(rule) {
    const response = await api.post("/alerts/rules", rule);
    return response.data.data;
}

export async function updateAlertRule(id, rule) {
    const response = await api.patch(`/alerts/rules/${id}`, rule);
    return response.data.data;
}

export async function deleteAlertRule(id) {
    await api.delete(`/alerts/rules/${id}`);
}

export async function getAlertEvents(state = "") {
    const response = await api.get("/alerts/events", {
        params: state ? { state } : {}
    });
    return response.data.data;
}

export async function acknowledgeAlert(id) {
    const response = await api.patch(`/alerts/events/${id}/acknowledge`);
    return response.data.data;
}

export async function getChannels() {
    const response = await api.get("/alerts/channels");
    return response.data.data;
}

export async function createChannel(channel) {
    const response = await api.post("/alerts/channels", channel);
    return response.data.data;
}

export async function deleteChannel(id) {
    await api.delete(`/alerts/channels/${id}`);
}

export async function testChannel(id) {
    const response = await api.post("/alerts/channels/test", { id });
    return response.data.data;
}
