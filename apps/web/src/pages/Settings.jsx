import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BellRing, Check, CirclePlus, FileBarChart, Router, Search, Send, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { createGroup, createChannel, deleteChannel, deleteGroup, getChannels, getGroups, getSettings, testChannel, updateSettings } from "../api/phase2";
import AccountMenu from "../components/AccountMenu";
import { useAuth } from "../auth/useAuth";

const emptyChannel = {
    name: "",
    type: "WEBHOOK",
    url: "",
    botToken: "",
    chatId: "",
    host: "",
    port: 587,
    secure: false,
    username: "",
    password: "",
    from: "",
    to: ""
};

function formatBytes(value) {
    if (!Number.isFinite(value) || value < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let scaled = value;
    let unit = 0;
    while (scaled >= 1024 && unit < units.length - 1) {
        scaled /= 1024;
        unit += 1;
    }
    return `${scaled.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function Settings() {
    const { user } = useAuth();
    const canManage = user.role !== "VIEWER";
    const canChangeSystemSettings = user.role === "SUPER_ADMIN";
    const [settings, setSettings] = useState(null);
    const [groups, setGroups] = useState([]);
    const [tags, setTags] = useState([]);
    const [channels, setChannels] = useState([]);
    const [groupName, setGroupName] = useState("");
    const [channelForm, setChannelForm] = useState(emptyChannel);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [settingsData, groupData, channelData] = await Promise.all([
                getSettings(),
                getGroups(),
                getChannels()
            ]);
            setSettings(settingsData);
            setGroups(groupData.groups);
            setTags(groupData.tags);
            setChannels(channelData);
            setError("");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not load system settings.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(load, 0);
        return () => clearTimeout(timer);
    }, [load]);

    async function saveSettings(event) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setMessage("");
        try {
            await updateSettings({
                pollingIntervalSeconds: settings.pollingIntervalSeconds,
                retentionDays: settings.retentionDays,
                retentionEnabled: settings.retentionEnabled
            });
            await load();
            setMessage("Settings saved.");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not save settings.");
        } finally {
            setSaving(false);
        }
    }

    async function addGroup(event) {
        event.preventDefault();
        try {
            await createGroup({ name: groupName });
            setGroupName("");
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not create device group.");
        }
    }

    async function addChannel(event) {
        event.preventDefault();
        const config = channelForm.type === "WEBHOOK"
            ? { url: channelForm.url }
            : channelForm.type === "TELEGRAM"
                ? { botToken: channelForm.botToken, chatId: channelForm.chatId }
                : {
                    host: channelForm.host,
                    port: Number(channelForm.port),
                    secure: channelForm.secure,
                    username: channelForm.username || undefined,
                    password: channelForm.password || undefined,
                    from: channelForm.from,
                    to: channelForm.to
                };
        try {
            setError("");
            await createChannel({
                name: channelForm.name,
                type: channelForm.type,
                config,
                enabled: true
            });
            setChannelForm(emptyChannel);
            await load();
            setMessage("Notification channel saved. Its credentials are encrypted at rest.");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not save notification channel.");
        }
    }

    async function runChannelTest(channel) {
        try {
            await testChannel(channel.id);
            setMessage(`Test notification sent through ${channel.name}.`);
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? `Test failed for ${channel.name}.`);
        }
    }

    async function removeChannel(channel) {
        if (!window.confirm(`Delete notification channel "${channel.name}"?`)) return;
        try {
            await deleteChannel(channel.id);
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not delete notification channel.");
        }
    }

    async function removeGroup(group) {
        if (!window.confirm(`Delete group "${group.name}"? Devices will remain in the inventory.`)) return;
        try {
            await deleteGroup(group.id);
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not delete device group.");
        }
    }

    function updateChannel(event) {
        const { name, value, type, checked } = event.target;
        setChannelForm((previous) => ({
            ...previous,
            [name]: type === "checkbox" ? checked : value
        }));
    }

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Activity size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <Link to="/" className="side-link"><Router size={17} />Overview</Link>
                <Link to="/alerts" className="side-link"><BellRing size={17} />Alerts</Link>
                <Link to="/discovery" className="side-link"><Search size={17} />Discovery</Link>
                <Link to="/reports" className="side-link"><FileBarChart size={17} />Reports</Link>
                <Link to="/settings" className="side-link active"><SettingsIcon size={17} />Settings</Link>
                <div className="sidebar-bottom"><span className="live-indicator"><i />Monitoring active</span><small>Sentinel NMS · Phase 2</small></div>
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>Settings</strong></div><div className="topbar-right"><AccountMenu /></div></header>
                <div className="page-content">
                    <div className="page-heading"><div><span className="eyebrow">SYSTEM CONFIGURATION</span><h1>Settings</h1><p>Manage polling, history retention, notification channels, and device groups.</p></div></div>
                    {error && <div className="notice-error" role="alert">{error}</div>}
                    {message && <div className="notice-success" role="status"><Check size={16} />{message}</div>}
                    {loading && <div className="loading-inline" role="status">Loading settings, groups, and notification channels...</div>}
                    {settings && <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">MONITORING</span><h2>Polling & data retention</h2></div></div>
                        {canChangeSystemSettings ? <form className="settings-form" onSubmit={saveSettings}>
                            <label>Polling interval (seconds)<input type="number" min="15" max="3600" value={settings.pollingIntervalSeconds} onChange={(event) => setSettings({ ...settings, pollingIntervalSeconds: Number(event.target.value) })} /><small>Devices are polled at this interval (15–3600 seconds).</small></label>
                            <label>Metric retention (days)<input type="number" min="1" max="3650" value={settings.retentionDays} onChange={(event) => setSettings({ ...settings, retentionDays: Number(event.target.value) })} /><small>When enabled, metric samples older than this period are deleted daily. Device and interface outage events are not removed by metric retention.</small></label>
                            <label className="checkbox-label"><input type="checkbox" checked={settings.retentionEnabled} onChange={(event) => setSettings({ ...settings, retentionEnabled: event.target.checked })} /> Enable automatic metric retention cleanup</label>
                            <div className="storage-estimate" role="status">
                                <strong>SQLite storage</strong>
                                <span>Current database file: {formatBytes(settings.storage.databaseBytes)}</span>
                                <span>{settings.storage.metricSamplesLast7Days.toLocaleString()} metric samples · approx. {formatBytes(settings.storage.metricBytesLast7Days)} in the last 7 days</span>
                                <span>Estimated metric data at {settings.retentionDays}-day retention: approx. {formatBytes(settings.storage.estimatedDailyMetricBytes * settings.retentionDays)}</span>
                                <small>Estimate assumes recent write volume continues; deleted rows may not reduce the SQLite file until it is compacted.</small>
                            </div>
                            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>
                        </form> : <div className="settings-form"><p className="form-help">Only Super Admin can change global polling and retention settings.</p><div className="storage-estimate" role="status"><strong>SQLite storage</strong><span>Current database file: {formatBytes(settings.storage.databaseBytes)}</span><span>Estimated metric data at {settings.retentionDays}-day retention: approx. {formatBytes(settings.storage.estimatedRetainedMetricBytes)}</span></div></div>}
                    </section>}
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">ORGANIZATION</span><h2>Device groups</h2></div></div>
                        {canManage && <form className="inline-form" onSubmit={addGroup}><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength="40" placeholder="New group name" required /><button className="button button-primary" type="submit"><CirclePlus size={16} />Add group</button></form>}
                        <div className="group-list">{groups.map((group) => <div className="group-row" key={group.id}><span className="group-avatar"><Router size={16} /></span><span className="group-name">{group.name}<small>{group._count.devices} devices</small></span>{canManage && <button className="icon-button danger-hover" title="Delete group" onClick={() => removeGroup(group)}><Trash2 size={15} /></button>}</div>)}{groups.length === 0 && <p className="table-empty">{loading ? "Loading device groups..." : "No groups yet. Add a group, then assign devices from the device editor."}</p>}</div>
                        <div className="tag-summary"><strong>Tags</strong><span>{tags.length} shared tags in use</span>{tags.map((tag) => <span className="tag-pill" key={tag.id}>{tag.name} · {tag._count.devices}</span>)}</div>
                    </section>
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">DELIVERY</span><h2>Notification channels</h2><p>Channel credentials are encrypted using ALERT_ENCRYPTION_KEY.</p></div></div>
                        <div className="channel-list">{channels.map((channel) => <div className="channel-row" key={channel.id}><span className="channel-icon"><Send size={16} /></span><span className="channel-name">{channel.name}<small>{channel.type} · {channel.lastError ? "Last delivery failed" : channel.lastSentAt ? "Last sent " + new Date(channel.lastSentAt).toLocaleString() : "Not sent yet"}</small></span>{canManage && <><button className="button button-quiet small-button" onClick={() => runChannelTest(channel)}>Test</button><button className="icon-button danger-hover" title="Delete channel" onClick={() => removeChannel(channel)}><Trash2 size={15} /></button></>}</div>)}{channels.length === 0 && <p className="table-empty">{loading ? "Loading notification channels..." : "No notification channels configured."}</p>}</div>
                        {canManage && <form className="channel-form" onSubmit={addChannel}>
                            <div className="phase2-section-heading"><h3>Add notification channel</h3></div>
                            <div className="form-row"><label>Name<input name="name" value={channelForm.name} onChange={updateChannel} required maxLength="80" /></label><label>Type<select name="type" value={channelForm.type} onChange={updateChannel}><option value="WEBHOOK">Webhook</option><option value="TELEGRAM">Telegram</option><option value="EMAIL">Email (SMTP)</option></select></label></div>
                            {channelForm.type === "WEBHOOK" && <label>Webhook URL<input type="url" name="url" value={channelForm.url} onChange={updateChannel} required placeholder="https://example.com/webhook" /></label>}
                            {channelForm.type === "TELEGRAM" && <div className="form-row"><label>Bot token<input name="botToken" type="password" value={channelForm.botToken} onChange={updateChannel} required /></label><label>Chat ID<input name="chatId" value={channelForm.chatId} onChange={updateChannel} required /></label></div>}
                            {channelForm.type === "EMAIL" && <>
                                <div className="form-row"><label>SMTP host<input name="host" value={channelForm.host} onChange={updateChannel} required /></label><label>SMTP port<input name="port" type="number" min="1" max="65535" value={channelForm.port} onChange={updateChannel} required /></label></div>
                                <div className="form-row"><label>Username<input name="username" value={channelForm.username} onChange={updateChannel} /></label><label>Password<input name="password" type="password" value={channelForm.password} onChange={updateChannel} /></label></div>
                                <div className="form-row"><label>From<input name="from" type="email" value={channelForm.from} onChange={updateChannel} required /></label><label>To<input name="to" type="email" value={channelForm.to} onChange={updateChannel} required /></label></div>
                                <label className="checkbox-label"><input name="secure" type="checkbox" checked={channelForm.secure} onChange={updateChannel} /> Use secure TLS connection</label>
                            </>}
                            <button className="button button-primary" type="submit"><CirclePlus size={16} />Save channel</button>
                        </form>}
                    </section>
                </div>
            </section>
        </main>
    );
}
