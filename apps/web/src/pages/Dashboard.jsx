import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, BellRing, CirclePlus, Cpu, FileBarChart, Pencil, RefreshCw, Router, Search, Settings, ShieldAlert, Trash2, Wifi, X } from "lucide-react";
import { getSummary, getDevices, getOperationsHealth } from "../api/dashboard";
import { getGroups } from "../api/phase2";
import api from "../api/client";
import { formatDate, formatUptime } from "../utils/format";
import AccountMenu from "../components/AccountMenu";
import { useAuth } from "../auth/useAuth";

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

const emptyDevice = {
    name: "",
    ipAddress: "",
    community: "public",
    snmpPort: 161,
    snmpVersion: "2c",
    snmpSecurityName: "",
    snmpSecurityLevel: "authPriv",
    snmpAuthProtocol: "sha",
    snmpAuthPassword: "",
    snmpPrivProtocol: "aes",
    snmpPrivPassword: "",
    routerOsPort: 443,
    username: "",
    password: "",
    enabled: true,
    groups: "",
    tags: ""
};

function DeviceDialog({ device, onClose, onSaved }) {
    const [form, setForm] = useState(device ? {
        name: device.name,
        ipAddress: device.ipAddress,
        snmpPort: device.snmpPort ?? 161,
        snmpVersion: device.snmpVersion ?? "2c",
        snmpSecurityName: device.snmpSecurityName ?? "",
        snmpSecurityLevel: device.snmpSecurityLevel ?? "authPriv",
        snmpAuthProtocol: device.snmpAuthProtocol ?? "sha",
        snmpAuthPassword: "",
        snmpPrivProtocol: device.snmpPrivProtocol ?? "aes",
        snmpPrivPassword: "",
        routerOsPort: device.routerOsPort ?? 443,
        username: device.username ?? "",
        password: "",
        enabled: device.enabled,
        groups: (device.groups ?? []).map((group) => group.name).join(", "),
        tags: (device.tags ?? []).map((tag) => tag.name).join(", ")
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
            const payload = { ...form, snmpPort: Number(form.snmpPort), routerOsPort: Number(form.routerOsPort) };
            const groups = form.groups.split(",").map((value) => value.trim()).filter(Boolean);
            const tags = form.tags.split(",").map((value) => value.trim()).filter(Boolean);
            delete payload.groups;
            delete payload.tags;
            if (payload.snmpVersion !== "3" || payload.snmpSecurityLevel === "noAuthNoPriv") {
                delete payload.snmpAuthPassword;
            }
            if (payload.snmpVersion !== "3" || payload.snmpSecurityLevel !== "authPriv") {
                delete payload.snmpPrivPassword;
            }
            for (const secret of ["community", "password", "snmpAuthPassword", "snmpPrivPassword"]) {
                if (device && !payload[secret]) delete payload[secret];
            }
            const response = await api.request({
                method: device ? "patch" : "post",
                url: device ? `/devices/${device.id}` : "/devices",
                data: payload
            });
            const deviceId = device?.id ?? response.data.data.id;
            await api.put(`/groups/devices/${deviceId}`, { groups, tags });
            onSaved();
            onClose();
        } catch (requestError) {
            const validationDetails = requestError.response?.data?.errors
                ?.map(({ path, message }) => `${path}: ${message}`)
                .join("; ");
            setError(validationDetails
                ? `Validation error: ${validationDetails}`
                : requestError.response?.data?.message ?? "Device could not be saved.");
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
                                <option value="3">SNMP v3</option>
                            </select>
                        </label>
                        <label>Port<input name="snmpPort" type="number" min="1" max="65535" value={form.snmpPort} onChange={update} required /></label>
                    </div>
                    {form.snmpVersion !== "3" ? <label>Community string
                        <input name="community" type="password" value={form.community ?? ""} onChange={update} placeholder={device ? "Leave blank to keep current" : "public"} required={!device} />
                    </label> : <>
                        <label>SNMPv3 security name<input name="snmpSecurityName" value={form.snmpSecurityName} onChange={update} required /></label>
                        <div className="form-row">
                            <label>Security level<select name="snmpSecurityLevel" value={form.snmpSecurityLevel} onChange={update}><option value="noAuthNoPriv">No authentication / privacy</option><option value="authNoPriv">Authentication only</option><option value="authPriv">Authentication + privacy</option></select></label>
                            {form.snmpSecurityLevel !== "noAuthNoPriv" && <label>Authentication protocol<select name="snmpAuthProtocol" value={form.snmpAuthProtocol} onChange={update}>{["sha", "sha224", "sha256", "sha384", "sha512", "md5"].map((protocol) => <option key={protocol} value={protocol}>{protocol.toUpperCase()}</option>)}</select></label>}
                        </div>
                        {form.snmpSecurityLevel !== "noAuthNoPriv" && <label>Authentication password<input name="snmpAuthPassword" type="password" minLength="8" value={form.snmpAuthPassword} onChange={update} placeholder={device ? "Leave blank to keep current" : "At least 8 characters"} required={!device || device.snmpVersion !== "3" || device.snmpSecurityLevel === "noAuthNoPriv"} /></label>}
                        {form.snmpSecurityLevel === "authPriv" && <div className="form-row"><label>Privacy protocol<select name="snmpPrivProtocol" value={form.snmpPrivProtocol} onChange={update}>{["aes", "aes256b", "aes256r", "des"].map((protocol) => <option key={protocol} value={protocol}>{protocol.toUpperCase()}</option>)}</select></label><label>Privacy password<input name="snmpPrivPassword" type="password" minLength="8" value={form.snmpPrivPassword} onChange={update} placeholder={device ? "Leave blank to keep current" : "At least 8 characters"} required={!device || device.snmpVersion !== "3" || device.snmpSecurityLevel !== "authPriv"} /></label></div>}
                    </>}
                    <details>
                        <summary>Optional MikroTik RouterOS v7 access</summary>
                        <div className="device-form">
                            <div className="form-row"><label>HTTPS REST port<input name="routerOsPort" type="number" min="1" max="65535" value={form.routerOsPort} onChange={update} /></label><label>RouterOS username<input name="username" value={form.username} onChange={update} autoComplete="username" /></label></div>
                            <label>RouterOS password<input name="password" type="password" value={form.password} onChange={update} placeholder={device ? "Leave blank to keep current" : "Optional"} autoComplete="new-password" /></label>
                            <small>Requires RouterOS v7 HTTPS REST with a valid TLS certificate and read-only API permissions.</small>
                        </div>
                    </details>
                    <label>Groups <small>Separate names with commas</small><input name="groups" value={form.groups} onChange={update} placeholder="Core network, Terban" /></label>
                    <label>Tags <small>Separate tags with commas</small><input name="tags" value={form.tags} onChange={update} placeholder="router, mikrotik, branch" /></label>
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
    const { user } = useAuth();
    const [summary, setSummary] = useState(null);
    const [operationsHealth, setOperationsHealth] = useState(null);
    const [devices, setDevices] = useState([]);
    const [groups, setGroups] = useState([]);
    const [tags, setTags] = useState([]);
    const [error, setError] = useState("");
    const [dialogDevice, setDialogDevice] = useState(undefined);
    const canManage = user.role !== "VIEWER";
    const [refreshing, setRefreshing] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [polling, setPolling] = useState(false);
    const [filter, setFilter] = useState("ALL");
    const [groupFilter, setGroupFilter] = useState("");
    const [tagFilter, setTagFilter] = useState("");
    const [searchText, setSearchText] = useState("");
    const [search, setSearch] = useState("");

    useEffect(() => {
        const timeout = window.setTimeout(() => setSearch(searchText.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [searchText]);

    useEffect(() => {
        getGroups()
            .then(({ groups: groupData, tags: tagData }) => {
                setGroups(groupData);
                setTags(tagData);
            })
            .catch((requestError) => setError(requestError.response?.data?.message ?? "Could not load device groups and tags."));
    }, []);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const filters = {
                ...(filter !== "ALL" ? { status: filter } : {}),
                ...(groupFilter ? { groupId: groupFilter } : {}),
                ...(tagFilter ? { tagId: tagFilter } : {}),
                ...(search ? { search } : {})
            };
            const [summaryData, deviceData, healthData] = await Promise.all([
                getSummary(),
                getDevices(filters),
                getOperationsHealth()
            ]);
            setSummary(summaryData);
            setDevices(deviceData);
            setOperationsHealth(healthData);
            setError("");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not connect to the Sentinel API.");
        } finally {
            setRefreshing(false);
            setInitialLoading(false);
        }
    }, [filter, groupFilter, tagFilter, search]);

    useEffect(() => {
        const initialLoad = setTimeout(load, 0);
        const timer = setInterval(load, 15000);
        return () => {
            clearTimeout(initialLoad);
            clearInterval(timer);
        };
    }, [load]);

const visibleDevices = devices;

    async function pollNow() {
        setPolling(true);
        try {
            const { data: queued } = await api.post("/metrics/poll");
            const deadline = Date.now() + 5 * 60 * 1000;
            let job;
            do {
                await wait(1500);
                const { data: response } = await api.get(`/metrics/poll/${queued.data.id}`);
                job = response.data;
                if (job.status === "FAILED") throw new Error(job.error || "The polling worker failed.");
            } while (["PENDING", "PROCESSING", "RETRY_WAIT"].includes(job.status) && Date.now() < deadline);

            if (job.status !== "COMPLETED") {
                const retry = job.status === "RETRY_WAIT"
                    ? ` Retry ${job.attempts}/${job.maxAttempts} scheduled for ${formatDate(job.nextAttemptAt)}.`
                    : "";
                throw new Error(`Polling job ${job.id} is ${job.status.toLowerCase()}.${retry}`);
            }
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? requestError.message ?? "Polling could not be started.");
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

    const stats = [
        { label: "Total devices", value: summary?.totalDevices ?? 0, icon: Router, color: "blue" },
        { label: "Online", value: summary?.upDevices ?? 0, icon: Wifi, color: "green" },
        { label: "Offline", value: summary?.downDevices ?? 0, icon: AlertTriangle, color: "red" },
        { label: "Open alerts", value: summary?.openAlerts ?? 0, icon: BellRing, color: "amber", href: "/alerts" },
        { label: "Metrics collected", value: summary?.totalMetrics ?? 0, icon: Activity, color: "violet" }
    ];

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Activity size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <a href="#overview" className="side-link active"><Activity size={17} />Overview</a>
                <a href="#devices" className="side-link"><Router size={17} />Devices<span className="side-count">{devices.length}</span></a>
                <Link to="/alerts" className="side-link"><ShieldAlert size={17} />Alerts</Link>
                <Link to="/discovery" className="side-link"><Search size={17} />Discovery</Link>
                <Link to="/reports" className="side-link"><FileBarChart size={17} />Reports</Link>
                <Link to="/settings" className="side-link"><Settings size={17} />Settings</Link>
                <div className="sidebar-bottom">
                    <span className="live-indicator"><i />Monitoring active</span>
                    <small>Sentinel NMS · MVP</small>
                </div>
            </aside>

            <section className="main-panel">
                <header className="topbar">
                    <div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div>
                    <div className="topbar-right"><span className="refresh-note"><i />Auto-refresh · 15s</span><AccountMenu /></div>
                </header>
                <div className="page-content" id="overview">
                    <div className="page-heading">
                        <div><span className="eyebrow">NETWORK OPERATIONS</span><h1>Good {new Date().getHours() < 12 ? "morning" : "afternoon"} <span className="wave">✳</span></h1><p>Here&apos;s what&apos;s happening across your network.</p></div>
                        {canManage && <div className="heading-actions">
                            <button className="button button-quiet" type="button" onClick={pollNow} disabled={polling}><RefreshCw size={16} className={polling ? "spin" : ""} />{polling ? "Polling..." : "Poll now"}</button>
                            <button className="button button-primary" type="button" onClick={() => setDialogDevice(null)}><CirclePlus size={17} />Add device</button>
                        </div>}
                    </div>
                    {error && <div className="notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
                    <div className="stats-grid">
                        {stats.map(({ label, value, icon: Icon, color, href }) => (
                            href
                                ? <Link to={href} className="stat-card" key={label}><div className={`stat-icon ${color}`}><Icon size={18} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value.toLocaleString()}</strong><span className="stat-caption">open incidents to review</span></Link>
                                : <article className="stat-card" key={label}><div className={`stat-icon ${color}`}><Icon size={18} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value.toLocaleString()}</strong><span className="stat-caption">{label === "Metrics collected" ? "historical data points" : label === "Total devices" ? "registered in inventory" : "currently reporting"}</span></article>
                        ))}
                    </div>
                    <section className="phase2-card operations-health" aria-labelledby="operations-health-title">
                        <div className="phase2-section-heading">
                            <div><span className="eyebrow">SYSTEM HEALTH</span><h2 id="operations-health-title">Polling worker</h2></div>
                            <button className="icon-button" onClick={load} title="Refresh system health" disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button>
                        </div>
                        {initialLoading && !operationsHealth ? <p className="loading-inline" role="status">Checking worker and polling queue...</p> : operationsHealth ? <>
                            <div className="operations-health-grid">
                                <div><span>Worker</span><strong className={operationsHealth.worker.alive ? "health-up" : "health-down"}>{operationsHealth.worker.alive ? "Running" : "Not responding"}</strong><small>Heartbeat {formatDate(operationsHealth.worker.lastHeartbeatAt)}</small></div>
                                <div><span>Queue depth</span><strong>{operationsHealth.queue.pending + operationsHealth.queue.processing + operationsHealth.queue.retryWait}</strong><small>{operationsHealth.queue.pending} pending · {operationsHealth.queue.processing} processing · {operationsHealth.queue.retryWait} retry wait</small></div>
                                <div><span>Last successful poll</span><strong>{operationsHealth.lastSuccessfulPollAt ? formatDate(operationsHealth.lastSuccessfulPollAt) : "Not yet"}</strong><small>{operationsHealth.consecutiveFailedJobs ? `${operationsHealth.consecutiveFailedJobs} consecutive failed job(s)` : "No consecutive job failures"}</small></div>
                            </div>
                            {operationsHealth.latestJob && <p className="form-help">Latest job: {operationsHealth.latestJob.status} · attempt {operationsHealth.latestJob.attempts}/{operationsHealth.latestJob.maxAttempts}{operationsHealth.latestJob.nextAttemptAt ? ` · retry at ${formatDate(operationsHealth.latestJob.nextAttemptAt)}` : ""}</p>}
                        </> : <p className="notice-error" role="alert">System health information is unavailable. Check the API connection and refresh.</p>}
                    </section>
                    <section className="device-section" id="devices">
                        <div className="section-heading"><div><span className="eyebrow">YOUR NETWORK</span><h2>Devices <span className="count-pill">{devices.length}</span></h2></div><div className="section-controls device-filters">
                            <label className="search-control"><Search size={16} /><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search name or IP" aria-label="Search devices by name or IP address" /></label>
                            <label className="sr-only" htmlFor="status-filter">Filter by status</label><select id="status-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All statuses</option><option value="UP">Online</option><option value="DOWN">Offline</option><option value="DISABLED">Disabled</option></select>
                            <label className="sr-only" htmlFor="group-filter">Filter by group</label><select id="group-filter" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
                            <label className="sr-only" htmlFor="tag-filter">Filter by tag</label><select id="tag-filter" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">All tags</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
                            <button className="icon-button" onClick={load} title="Refresh list" disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button></div></div>
                        <div className="table-wrap">
                            <table className="device-table">
                                <thead><tr><th>DEVICE</th><th>STATUS</th><th>CPU LOAD</th><th>UPTIME</th><th>LAST SEEN</th><th><span className="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    {devices.map((device) => (
                                        <tr key={device.id}>
                                            <td><div className="device-cell"><span className="device-symbol"><Router size={18} /></span><span><Link to={`/device/${device.id}`} className="device-name">{device.name}</Link><small>{device.ipAddress}</small><span className="device-labels">{[...(device.groups ?? []).map((group) => group.name), ...(device.tags ?? []).map((tag) => `#${tag.name}`)].slice(0, 4).join(" · ")}</span></span></div></td>
                                            <td><span className={`status-badge ${device.status.toLowerCase()}`}><i />{device.status === "UP" ? "Online" : device.status === "DISABLED" ? "Disabled" : "Offline"}</span></td>
                                            <td><span className="cpu-value">{device.metrics?.cpu != null ? `${Number(device.metrics.cpu) / 10}%` : "—"}</span></td>
                                            <td>{formatUptime(device.metrics?.uptime)}</td>
                                            <td className="muted">{formatDate(device.lastSeen)}</td>
                                            <td><div className="row-actions"><Link to={`/device/${device.id}`} className="icon-button" title="View device"><Cpu size={16} /></Link>{canManage && <><button className="icon-button" title="Edit device" onClick={() => setDialogDevice(device)}><Pencil size={15} /></button><button className="icon-button danger-hover" title="Delete device" onClick={() => removeDevice(device)}><Trash2 size={15} /></button></>}</div></td>
                                        </tr>
                                    ))}
                                    {!initialLoading && devices.length === 0 && <tr><td colSpan="6" className="table-empty">{search || filter !== "ALL" || groupFilter || tagFilter ? "No devices match these filters. Clear a filter or search for another device." : "No devices have been added yet. Add a device to begin monitoring."}</td></tr>}
                                    {visibleDevices.length === 0 && <tr><td colSpan="6"><div className="empty-state" aria-live="polite"><span className="empty-icon"><Router size={23} /></span><strong>{initialLoading ? "Loading devices..." : error && devices.length === 0 ? "Devices could not be loaded" : devices.length === 0 ? "Your network is ready" : "No matching devices"}</strong><p>{initialLoading ? "Fetching the latest monitoring data." : error && devices.length === 0 ? "Check the API connection, then refresh." : devices.length === 0 ? "Add your first SNMP device to start monitoring." : "Try selecting a different status filter."}</p>{!initialLoading && !error && devices.length === 0 && canManage && <button className="button button-primary" onClick={() => setDialogDevice(null)}><CirclePlus size={16} />Add your first device</button>}</div></td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <div className="table-footer"><span>Showing {visibleDevices.length} of {devices.length} devices</span><span>Last poll: {formatDate(summary?.lastPolling)}</span></div>
                    </section>
                </div>
            </section>
            {dialogDevice !== undefined && canManage && <DeviceDialog device={dialogDevice} onClose={() => setDialogDevice(undefined)} onSaved={load} />}
        </main>
    );
}
