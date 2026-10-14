import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CirclePlus, Cpu, Pencil, RefreshCw, Router, Trash2, Wifi, X } from "lucide-react";
import { getSummary, getDevices } from "../api/dashboard";
import api from "../api/client";
import { formatDate } from "../utils/format";

const emptyDevice = {
    name: "",
    ipAddress: "",
    community: "public",
    snmpPort: 161,
    snmpVersion: "2c",
    enabled: true
};

function DeviceDialog({ device, onClose, onSaved }) {
    const [form, setForm] = useState(device ? {
        name: device.name,
        ipAddress: device.ipAddress,
        snmpPort: device.snmpPort ?? 161,
        snmpVersion: device.snmpVersion ?? "2c",
        enabled: device.enabled
    } : emptyDevice);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    function update(event) {
        const { name, value, type, checked } = event.target;
        setForm((previous) => ({ ...previous, [name]: type === "checkbox" ? checked : value }));
    }

    async function submit(event) {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const payload = { ...form, snmpPort: Number(form.snmpPort) };
            if (device && !payload.community) delete payload.community;
            await api.request({
                method: device ? "patch" : "post",
                url: device ? `/devices/${device.id}` : "/devices",
                data: payload
            });
            onSaved();
            onClose();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Device could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="device-dialog-title">
                <div className="dialog-heading">
                    <div>
                        <span className="eyebrow">DEVICE MANAGEMENT</span>
                        <h2 id="device-dialog-title">{device ? "Edit device" : "Add device"}</h2>
                    </div>
                    <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={submit} className="device-form">
                    <label>Device name<input name="name" value={form.name} onChange={update} required minLength="3" /></label>
                    <label>IP address<input name="ipAddress" value={form.ipAddress} onChange={update} required placeholder="192.168.1.1" /></label>
                    <div className="form-row">
                        <label>SNMP version
                            <select name="snmpVersion" value={form.snmpVersion} onChange={update}>
                                <option value="2c">SNMP v2c</option>
                                <option value="1">SNMP v1</option>
                            </select>
                        </label>
                        <label>Port<input name="snmpPort" type="number" min="1" max="65535" value={form.snmpPort} onChange={update} required /></label>
                    </div>
                    <label>Community string
                        <input name="community" type="password" value={form.community ?? ""} onChange={update} placeholder={device ? "Leave blank to keep current" : "public"} required={!device} />
                    </label>
                    <label className="checkbox-label"><input name="enabled" type="checkbox" checked={form.enabled} onChange={update} /> Include in monitoring</label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <div className="dialog-actions">
                        <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
                        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving..." : device ? "Save changes" : "Add device"}</button>
                    </div>
                </form>
            </section>
        </div>
    );
}

export default function Dashboard() {
    const [summary, setSummary] = useState(null);
    const [devices, setDevices] = useState([]);
    const [error, setError] = useState("");
    const [dialogDevice, setDialogDevice] = useState(undefined);
    const [refreshing, setRefreshing] = useState(false);
    const [polling, setPolling] = useState(false);
    const [filter, setFilter] = useState("ALL");

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [summaryData, deviceData] = await Promise.all([getSummary(), getDevices()]);
            setSummary(summaryData);
            setDevices(deviceData);
            setError("");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not connect to the Sentinel API.");
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const initialLoad = setTimeout(load, 0);
        const timer = setInterval(load, 15000);
        return () => {
            clearTimeout(initialLoad);
            clearInterval(timer);
        };
    }, [load]);

    async function pollNow() {
        setPolling(true);
        try {
            await api.post("/metrics/poll");
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Polling could not be started.");
        } finally {
            setPolling(false);
        }
    }

    async function removeDevice(device) {
        if (!window.confirm(`Remove ${device.name}? Its historical metrics will also be deleted.`)) return;
        try {
            await api.delete(`/devices/${device.id}`);
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Device could not be removed.");
        }
    }

    const visibleDevices = filter === "ALL"
        ? devices
        : devices.filter((device) => device.status === filter);
    const stats = [
        { label: "Total devices", value: summary?.totalDevices ?? 0, icon: Router, color: "blue" },
        { label: "Online", value: summary?.upDevices ?? 0, icon: Wifi, color: "green" },
        { label: "Offline", value: summary?.downDevices ?? 0, icon: AlertTriangle, color: "red" },
        { label: "Metrics collected", value: summary?.totalMetrics ?? 0, icon: Activity, color: "violet" }
    ];

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Activity size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <a href="#overview" className="side-link active"><Activity size={17} />Overview</a>
                <a href="#devices" className="side-link"><Router size={17} />Devices<span className="side-count">{devices.length}</span></a>
                <div className="sidebar-bottom">
                    <span className="live-indicator"><i />Monitoring active</span>
                    <small>Sentinel NMS · MVP</small>
                </div>
            </aside>

            <section className="main-panel">
                <header className="topbar">
                    <div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div>
                    <div className="topbar-right"><span className="refresh-note"><i />Auto-refresh · 15s</span><button className="avatar" title="Network administrator">NA</button></div>
                </header>
                <div className="page-content" id="overview">
                    <div className="page-heading">
                        <div><span className="eyebrow">NETWORK OPERATIONS</span><h1>Good {new Date().getHours() < 12 ? "morning" : "afternoon"} <span className="wave">✳</span></h1><p>Here&apos;s what&apos;s happening across your network.</p></div>
                        <div className="heading-actions">
                            <button className="button button-quiet" type="button" onClick={pollNow} disabled={polling}><RefreshCw size={16} className={polling ? "spin" : ""} />{polling ? "Polling..." : "Poll now"}</button>
                            <button className="button button-primary" type="button" onClick={() => setDialogDevice(null)}><CirclePlus size={17} />Add device</button>
                        </div>
                    </div>
                    {error && <div className="notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
                    <div className="stats-grid">
                        {stats.map(({ label, value, icon: Icon, color }) => (
                            <article className="stat-card" key={label}><div className={`stat-icon ${color}`}><Icon size={18} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value.toLocaleString()}</strong><span className="stat-caption">{label === "Metrics collected" ? "historical data points" : label === "Total devices" ? "registered in inventory" : "currently reporting"}</span></article>
                        ))}
                    </div>
                    <section className="device-section" id="devices">
                        <div className="section-heading"><div><span className="eyebrow">YOUR NETWORK</span><h2>Devices <span className="count-pill">{devices.length}</span></h2></div><div className="section-controls"><label className="filter-label" htmlFor="status-filter">Status</label><select id="status-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All devices</option><option value="UP">Online</option><option value="DOWN">Offline</option><option value="DISABLED">Disabled</option></select><button className="icon-button" onClick={load} title="Refresh list" disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button></div></div>
                        <div className="table-wrap">
                            <table className="device-table">
                                <thead><tr><th>DEVICE</th><th>STATUS</th><th>CPU LOAD</th><th>UPTIME</th><th>LAST SEEN</th><th><span className="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    {visibleDevices.map((device) => (
                                        <tr key={device.id}>
                                            <td><div className="device-cell"><span className="device-symbol"><Router size={18} /></span><span><Link to={`/device/${device.id}`} className="device-name">{device.name}</Link><small>{device.ipAddress}</small></span></div></td>
                                            <td><span className={`status-badge ${device.status.toLowerCase()}`}><i />{device.status === "UP" ? "Online" : device.status === "DISABLED" ? "Disabled" : "Offline"}</span></td>
                                            <td><span className="cpu-value">{device.metrics?.cpu != null ? `${Number(device.metrics.cpu) / 10}%` : "—"}</span></td>
                                            <td>{device.metrics?.uptime ?? "—"}</td>
                                            <td className="muted">{formatDate(device.lastSeen)}</td>
                                            <td><div className="row-actions"><Link to={`/device/${device.id}`} className="icon-button" title="View device"><Cpu size={16} /></Link><button className="icon-button" title="Edit device" onClick={() => setDialogDevice(device)}><Pencil size={15} /></button><button className="icon-button danger-hover" title="Delete device" onClick={() => removeDevice(device)}><Trash2 size={15} /></button></div></td>
                                        </tr>
                                    ))}
                                    {visibleDevices.length === 0 && <tr><td colSpan="6"><div className="empty-state"><span className="empty-icon"><Router size={23} /></span><strong>{devices.length === 0 ? "Your network is ready" : "No matching devices"}</strong><p>{devices.length === 0 ? "Add your first SNMP device to start monitoring." : "Try selecting a different status filter."}</p>{devices.length === 0 && <button className="button button-primary" onClick={() => setDialogDevice(null)}><CirclePlus size={16} />Add your first device</button>}</div></td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <div className="table-footer"><span>Showing {visibleDevices.length} of {devices.length} devices</span><span>Last poll: {formatDate(summary?.lastPolling)}</span></div>
                    </section>
                </div>
            </section>
            {dialogDevice !== undefined && <DeviceDialog device={dialogDevice} onClose={() => setDialogDevice(undefined)} onSaved={load} />}
        </main>
    );
}
