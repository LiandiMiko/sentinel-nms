import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock3, Cpu, Gauge, HardDrive, Info, Router, Signal, Wifi } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDevice } from "../api/dashboard";
import { getMetricHistory, getInterfaces, getDeviceMetricSummary, getDeviceEvents } from "../api/metric";
import api from "../api/client";
import { formatDate, formatUptime } from "../utils/format";
import AccountMenu from "../components/AccountMenu";

function asTraffic(history) {
    return history.map((item, index) => {
        if (index === 0) return { ...item, rate: 0 };
        const previous = history[index - 1];
        const seconds = (new Date(item.createdAt) - new Date(previous.createdAt)) / 1000;
        const countersAreValid = /^\d+$/.test(item.value) && /^\d+$/.test(previous.value);
        const difference = countersAreValid
            ? BigInt(item.value) - BigInt(previous.value)
            : -1n;
        return {
            ...item,
            rate: seconds > 0 && difference >= 0n ? Number(difference) * 8 / seconds : 0
        };
    });
}

function formatRate(value) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)} Kbps`;
    return `${Math.round(value)} bps`;
}

function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let scaled = bytes;
    let unit = 0;
    while (scaled >= 1024 && unit < units.length - 1) {
        scaled /= 1024;
        unit += 1;
    }
    return `${scaled.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function statusLabel(value) {
    return ({ 1: "Up", 2: "Down", 3: "Testing", 4: "Unknown", 5: "Dormant", 6: "Not present", 7: "Lower layer down" })[Number(value)] ?? "Not reported";
}

function interfaceType(value) {
    return ({ 6: "Ethernet", 24: "Loopback", 53: "Virtual", 71: "Wi-Fi", 131: "Tunnel", 135: "VLAN" })[Number(value)] ?? (value ? `Type ${value}` : "—");
}

function formatDuration(start, end = new Date()) {
    const seconds = Math.max(0, Math.floor((new Date(end) - new Date(start)) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (days) return `${days}d ${hours}h ${minutes}m`;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${remainingSeconds}s`;
    return `${remainingSeconds}s`;
}

function formatHistoryTime(value, range) {
    const date = new Date(value);
    if (range >= 24 * 60 * 60) {
        return date.toLocaleString([], {
            month: "short",
            day: "numeric",
            ...(range < 7 * 24 * 60 * 60 ? { hour: "2-digit", minute: "2-digit" } : {})
        });
    }
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const HISTORY_WINDOWS = [
    ["5 minutes", 5 * 60],
    ["10 minutes", 10 * 60],
    ["15 minutes", 15 * 60],
    ["30 minutes", 30 * 60],
    ["1 hour", 60 * 60],
    ["2 hours", 2 * 60 * 60],
    ["3 hours", 3 * 60 * 60],
    ["6 hours", 6 * 60 * 60],
    ["12 hours", 12 * 60 * 60],
    ["1 day", 24 * 60 * 60],
    ["2 days", 2 * 24 * 60 * 60],
    ["3 days", 3 * 24 * 60 * 60],
    ["1 week", 7 * 24 * 60 * 60],
    ["3 weeks", 21 * 24 * 60 * 60],
    ["1 month", 30 * 24 * 60 * 60],
    ["3 months", 90 * 24 * 60 * 60],
    ["6 months", 180 * 24 * 60 * 60]
];

export default function DeviceDetail() {
    const { id } = useParams();
    const [device, setDevice] = useState(null);
    const [cpuHistory, setCpuHistory] = useState([]);
    const [memoryHistory, setMemoryHistory] = useState([]);
    const [interfaces, setInterfaces] = useState([]);
    const [deviceMetrics, setDeviceMetrics] = useState(null);
    const [deviceEvents, setDeviceEvents] = useState([]);
    const [eventTypeFilter, setEventTypeFilter] = useState("ALL");
    const [eventStatusFilter, setEventStatusFilter] = useState("ALL");
    const [eventSearch, setEventSearch] = useState("");
    const [eventShowAll, setEventShowAll] = useState(false);
    const [selectedInterface, setSelectedInterface] = useState("");
    const [selectedWindow, setSelectedWindow] = useState(String(60 * 60));
    const [rangeSeconds, setRangeSeconds] = useState(60 * 60);
    const [customDays, setCustomDays] = useState("0");
    const [customHours, setCustomHours] = useState("1");
    const [customRangeError, setCustomRangeError] = useState("");
    const [traffic, setTraffic] = useState([]);
    const [routerOs, setRouterOs] = useState(null);
    const [loadingRouterOs, setLoadingRouterOs] = useState(false);
    const [routerOsFilter, setRouterOsFilter] = useState("");
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const [deviceData, history, memorySamples, interfaceData, metricSummary, events] = await Promise.all([
                getDevice(id),
                getMetricHistory(id, "cpu", 100, rangeSeconds),
                getMetricHistory(id, "memory.usedPercent", 100, rangeSeconds),
                getInterfaces(id),
                getDeviceMetricSummary(id),
                getDeviceEvents(id)
            ]);
            const isOnline = deviceData.enabled && deviceData.lastSeen
                && Date.now() - new Date(deviceData.lastSeen).getTime() < 90000;
            setDevice({
                ...deviceData,
                status: !deviceData.enabled ? "DISABLED" : isOnline ? "UP" : "DOWN"
            });
            setCpuHistory(history.map((item) => ({
                time: formatHistoryTime(item.createdAt, rangeSeconds),
                cpu: Number(item.value) / 10,
                createdAt: item.createdAt
            })));
            setMemoryHistory(memorySamples.map((item) => ({
                time: formatHistoryTime(item.createdAt, rangeSeconds),
                usedPercent: Number(item.value),
                createdAt: item.createdAt
            })));
            setInterfaces(interfaceData);
            setDeviceMetrics(metricSummary);
            setDeviceEvents(events);
            setSelectedInterface((current) => current || interfaceData[0]?.index || "");
            setError("");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not load device information.");
        }
    }, [id, rangeSeconds]);

    async function loadRouterOs() {
        setLoadingRouterOs(true);
        setError("");
        try {
            const response = await api.get(`/devices/${id}/routeros`);
            setRouterOs(response.data.data);
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not query RouterOS.");
        } finally {
            setLoadingRouterOs(false);
        }
    }

    useEffect(() => {
        const initialLoad = setTimeout(load, 0);
        const timer = setInterval(load, 15000);
        return () => {
            clearTimeout(initialLoad);
            clearInterval(timer);
        };
    }, [load]);

    useEffect(() => {
        if (!selectedInterface) return;
        Promise.all([
            getMetricHistory(id, `interface.${selectedInterface}.inOctets`, 100, rangeSeconds),
            getMetricHistory(id, `interface.${selectedInterface}.outOctets`, 100, rangeSeconds)
        ]).then(([input, output]) => {
            const inbound = asTraffic(input);
            const outbound = asTraffic(output);
            const points = new Map();
            inbound.forEach((item) => points.set(item.createdAt, {
                time: formatHistoryTime(item.createdAt, rangeSeconds),
                inbound: item.rate,
                createdAt: item.createdAt
            }));
            outbound.forEach((item) => {
                const point = points.get(item.createdAt) ?? {
                    time: formatHistoryTime(item.createdAt, rangeSeconds),
                    createdAt: item.createdAt
                };
                point.outbound = item.rate;
                points.set(item.createdAt, point);
            });
            setTraffic([...points.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
        }).catch((requestError) => {
            setError(requestError.response?.data?.message ?? "Could not load interface traffic history.");
        });
    }, [id, selectedInterface, rangeSeconds]);

    function updateHistoryWindow(event) {
        const value = event.target.value;
        setSelectedWindow(value);
        setCustomRangeError("");
        if (value !== "custom") setRangeSeconds(Number(value));
    }

    function applyCustomRange(event) {
        event.preventDefault();
        const days = Number(customDays);
        const hours = Number(customHours);
        const seconds = (days * 24 + hours) * 60 * 60;
        if (!Number.isInteger(days) || !Number.isInteger(hours) || days < 0 || hours < 0 || seconds < 60 * 60) {
            setCustomRangeError("Enter at least 1 hour using days and/or hours.");
            return;
        }
        if (seconds > 180 * 24 * 60 * 60) {
            setCustomRangeError("Custom period cannot exceed 180 days (6 months).");
            return;
        }
        setCustomRangeError("");
        setRangeSeconds(seconds);
    }

    const selectedWindowLabel = HISTORY_WINDOWS.find(([, seconds]) => seconds === rangeSeconds)?.[0]
        ?? [Math.floor(rangeSeconds / 86400) ? `${Math.floor(rangeSeconds / 86400)}d` : "", Math.floor((rangeSeconds % 86400) / 3600) ? `${Math.floor((rangeSeconds % 86400) / 3600)}h` : "", Math.floor((rangeSeconds % 3600) / 60) ? `${Math.floor((rangeSeconds % 3600) / 60)}m` : ""].filter(Boolean).join(" ");

    const normalizedRouterOsFilter = routerOsFilter.trim().toLowerCase();
    const queueItems = (routerOs?.queues.items ?? []).filter((item) => (
        !normalizedRouterOsFilter
        || Object.values(item).join(" ").toLowerCase().includes(normalizedRouterOsFilter)
    ));
    const connectionItems = (routerOs?.connections.items ?? []).filter((item) => (
        !normalizedRouterOsFilter
        || Object.values(item).join(" ").toLowerCase().includes(normalizedRouterOsFilter)
    ));
        const eventSearchNormalized = eventSearch.trim().toLowerCase();
    const filteredEvents = deviceEvents.filter((event) => {
        if (eventTypeFilter === "device" && event.type !== "device-outage") return false;
        if (eventTypeFilter === "interface" && event.type !== "interface-outage") return false;
        if (eventStatusFilter === "open" && event.resolvedAt) return false;
        if (eventStatusFilter === "resolved" && !event.resolvedAt) return false;
        if (eventSearchNormalized) {
            const haystack = [event.subject, event.message, event.type]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            if (!haystack.includes(eventSearchNormalized)) return false;
        }
        return true;
    });
    // Default: 10 terbaru (API sudah order startedAt desc)
    const visibleEvents = eventShowAll ? filteredEvents : filteredEvents.slice(0, 10);

    if (!device && !error) return <main className="detail-shell"><div className="loading-state">Loading device...</div></main>;

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Signal size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <Link to="/" className="side-link"><ArrowLeft size={17} />Overview</Link>
                <a href="#device-overview" className="side-link active"><Router size={17} />Device details</a>
                <div className="sidebar-bottom"><span className="live-indicator"><i />Monitoring active</span><small>Sentinel NMS · MVP</small></div>
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>{device?.name ?? "Device"}</strong></div><div className="topbar-right"><span className="refresh-note"><i />Auto-refresh · 15s</span><AccountMenu /></div></header>
                <div className="page-content detail-content" id="device-overview">
                    {error && <div className="notice-error" role="alert">{error}</div>}
                    {device && <>
                        <Link to="/" className="back-link"><ArrowLeft size={16} />All devices</Link>
                        <div className="page-heading device-heading">
                            <div><span className="eyebrow">DEVICE DETAILS</span><h1>{device.name}</h1><p>{device.ipAddress} <span className="separator-dot">·</span> SNMP v{device.snmpVersion}</p></div>
                            <span className={`status-badge large ${device.status.toLowerCase()}`}><i />{device.status === "UP" ? "Online" : device.status === "DISABLED" ? "Disabled" : "Offline"}</span>
                        </div>
                        <div className="detail-stats">
                            <article className="detail-stat"><span className="detail-stat-icon blue"><Router size={18} /></span><span><small>HOSTNAME</small><strong>{device.snapshot?.hostname || "Not reported"}</strong></span></article>
                            <article className="detail-stat"><span className="detail-stat-icon violet"><Cpu size={18} /></span><span><small>CPU LOAD</small><strong>{device.snapshot?.cpu ? `${Number(device.snapshot.cpu) / 10}%` : "—"}</strong></span></article>
                            <article className="detail-stat"><span className="detail-stat-icon amber"><Clock3 size={18} /></span><span><small>UPTIME</small><strong>{formatUptime(device.snapshot?.uptime)}</strong></span></article>
                            <article className="detail-stat"><span className="detail-stat-icon green"><Wifi size={18} /></span><span><small>LAST SEEN</small><strong>{formatDate(device.lastSeen)}</strong></span></article>
                            {deviceMetrics?.memory && <article className="detail-stat"><span className="detail-stat-icon amber"><HardDrive size={18} /></span><span><small>MEMORY</small><strong>{Number(deviceMetrics.memory.usedPercent).toFixed(1)}% · {formatBytes(deviceMetrics.memory.usedBytes)} / {formatBytes(deviceMetrics.memory.totalBytes)}</strong></span></article>}
                        </div>
                        <section className="chart-card inventory-card">
                            <div className="chart-heading"><div><span className="eyebrow">SYSTEM INVENTORY</span><h2><Info size={17} />Device information</h2><p>System identification and resources exposed by this device via SNMP.</p></div></div>
                            {deviceMetrics?.system?.description ? <p className="system-description">{deviceMetrics.system.description}</p> : <p className="muted">System description is not provided by this device.</p>}
                            <div className="system-info-grid">
                                <div><small>SNMP HOSTNAME</small><strong>{deviceMetrics?.system?.hostname ?? device.snapshot?.hostname ?? "—"}</strong></div>
                                <div><small>SNMP CONTACT</small><strong>{deviceMetrics?.system?.contact ?? "Not configured"}</strong></div>
                                <div><small>PHYSICAL LOCATION</small><strong>{deviceMetrics?.system?.location ?? "Not configured"}</strong></div>
                                <div><small>DEVICE UPTIME</small><strong>{formatUptime(device.snapshot?.uptime)}</strong></div>
                            </div>
                            {deviceMetrics?.storage?.length > 0 && <div className="table-wrap inventory-table"><table className="device-table phase2-table">
                                <thead><tr><th>STORAGE</th><th>USED</th><th>CAPACITY</th><th>UTILIZATION</th></tr></thead>
                                <tbody>{deviceMetrics.storage.map((item) => <tr key={item.index}><td><strong>{item.name ?? `Storage ${item.index}`}</strong></td><td>{formatBytes(item.usedBytes)}</td><td>{formatBytes(item.totalBytes)}</td><td>{Number(item.usedPercent).toFixed(1)}%</td></tr>)}</tbody>
                            </table></div>}
                            {deviceMetrics?.hardware?.length > 0 && <div className="table-wrap inventory-table"><table className="device-table phase2-table">
                                <thead><tr><th>HARDWARE ENTITY</th><th>VENDOR</th><th>MODEL</th><th>SERIAL NUMBER</th><th>REVISIONS</th></tr></thead>
                                <tbody>{deviceMetrics.hardware.map((item) => <tr key={item.index}>
                                    <td><strong>{item.name ?? item.description ?? `Entity ${item.index}`}</strong></td><td>{item.vendor ?? "—"}</td><td>{item.model ?? "—"}</td><td>{item.serialNumber ?? "—"}</td><td>{[item.hardwareRevision, item.firmwareRevision, item.softwareRevision].filter(Boolean).join(" · ") || "—"}</td>
                                </tr>)}</tbody>
                            </table></div>}
                            {deviceMetrics?.sensors?.length > 0 && <div className="table-wrap inventory-table"><table className="device-table phase2-table">
                                <thead><tr><th>HARDWARE SENSOR</th><th>READING</th><th>STATUS</th><th>TYPE</th></tr></thead>
                                <tbody>{deviceMetrics.sensors.map((item) => <tr key={item.index}>
                                    <td><strong>{item.name ?? `Sensor ${item.index}`}</strong></td><td>{item.value} {item.unit}</td><td>{item.status === "1" ? "Operational" : `Status ${item.status}`}</td><td>{item.type}</td>
                                </tr>)}</tbody>
                            </table></div>}
                            {!deviceMetrics?.memory && deviceMetrics?.storage?.length === 0 && <p className="muted inventory-empty">Memory and storage usage are not exposed through standard SNMP on this device.</p>}
                        </section>
                        <section className="chart-card routeros-card">
                            <div className="chart-heading">
                                <div><span className="eyebrow">MIKROTIK ROUTEROS v7</span><h2>RouterOS live data</h2><p>Queue statistics and active firewall connections via read-only HTTPS REST.</p></div>
                                <button className="button button-quiet" type="button" onClick={loadRouterOs} disabled={loadingRouterOs || !device.username}>{loadingRouterOs ? "Loading..." : "Load RouterOS data"}</button>
                            </div>
                            {!device.username && <p className="muted inventory-empty">Configure RouterOS username and password in the device form to view queues and firewall connections. Use a read-only RouterOS account.</p>}
                            {routerOs && <>
                                <div className="routeros-data-note">
                                    Snapshot fetched {formatDate(routerOs.fetchedAt)}. Firewall connection entries show active traffic metadata (addresses, ports, protocol, and byte counters), not browsing content.
                                </div>
                                <div className="routeros-summary"><strong>{routerOs.identity}</strong><span>RouterOS {routerOs.resource.version ?? "version unavailable"}</span><span>CPU {routerOs.resource.cpuLoad ?? "—"}%</span><span>Uptime {routerOs.resource.uptime ?? "—"}</span></div>
                                <div className="table-wrap"><table className="device-table phase2-table"><thead><tr><th>INTERFACE</th><th>TYPE</th><th>LINK</th><th>RX BYTES</th><th>TX BYTES</th></tr></thead><tbody>
                                    {routerOs.interfaces.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.type ?? "—"}</td><td>{item.disabled ? "Disabled" : item.running ? "Running" : "Down"}</td><td>{item.rxBytes ?? "—"}</td><td>{item.txBytes ?? "—"}</td></tr>)}
                                    {routerOs.interfaces.length === 0 && <tr><td colSpan="5" className="table-empty">No interfaces were returned.</td></tr>}
                                </tbody></table></div>
                                <div className="routeros-list-heading">
                                    <div><h3>Simple queues <span className="count-pill">{routerOs.queues.total}</span></h3><p>Per-queue targets, configured limits, current RX/TX rate, and session counters.</p></div>
                                    <input aria-label="Filter RouterOS queues and connections" placeholder="Filter by user, IP, target, or protocol" value={routerOsFilter} onChange={(event) => setRouterOsFilter(event.target.value)} />
                                </div>
                                <div className="table-wrap"><table className="device-table phase2-table routeros-wide-table"><thead><tr><th>QUEUE</th><th>TARGET</th><th>PARENT</th><th>MAX LIMIT (RX/TX)</th><th>LIVE RATE (RX/TX)</th><th>BYTES (RX/TX)</th><th>PACKETS (RX/TX)</th><th>QUEUED</th><th>STATUS</th></tr></thead><tbody>
                                    {queueItems.map((item, index) => <tr key={`${item.name}-${item.target}-${index}`}><td><strong>{item.name ?? "—"}</strong>{item.dynamic && <small className="cell-subtitle">Dynamic</small>}</td><td>{item.target ?? "—"}</td><td>{item.parent ?? "—"}</td><td>{item.maxLimit ?? "—"}</td><td>{item.rate ?? "—"}</td><td>{item.bytes ?? "—"}</td><td>{item.packets ?? "—"}</td><td>{item.queuedBytes ?? "—"} B / {item.queuedPackets ?? "—"} pkts</td><td>{item.disabled ? "Disabled" : "Enabled"}</td></tr>)}
                                    {queueItems.length === 0 && <tr><td colSpan="9" className="table-empty">{routerOs.queues.error ? `Queue list unavailable: ${routerOs.queues.error}` : routerOs.queues.total === 0 ? "No simple queues were returned." : "No queues match this filter."}</td></tr>}
                                </tbody></table></div>
                                {routerOs.queues.truncated && <p className="muted inventory-empty">Showing the first {routerOs.queues.items.length} of {routerOs.queues.total} queues.</p>}
                                <div className="routeros-list-heading"><div><h3>Firewall connections <span className="count-pill">{routerOs.connections.total}</span></h3><p>Active connection tracking entries and their original/reply byte counters.</p></div></div>
                                <div className="table-wrap"><table className="device-table phase2-table routeros-wide-table"><thead><tr><th>PROTOCOL</th><th>SOURCE</th><th>DESTINATION</th><th>TCP STATE</th><th>CONNECTION MARK</th><th>ORIGINAL BYTES / PACKETS</th><th>REPLY BYTES / PACKETS</th><th>TIMEOUT</th></tr></thead><tbody>
                                    {connectionItems.map((item, index) => <tr key={`${item.source}-${item.destination}-${index}`}><td>{item.protocol ?? "—"}</td><td>{item.source ?? "—"}</td><td>{item.destination ?? "—"}</td><td>{item.tcpState ?? item.state ?? "—"}</td><td>{item.connectionMark ?? "—"}</td><td>{item.originalBytes ?? "—"} B / {item.originalPackets ?? "—"}</td><td>{item.replyBytes ?? "—"} B / {item.replyPackets ?? "—"}</td><td>{item.timeout ?? "—"}</td></tr>)}
                                    {connectionItems.length === 0 && <tr><td colSpan="8" className="table-empty">{routerOs.connections.error ? `Firewall connections unavailable: ${routerOs.connections.error}` : routerOs.connections.total === 0 ? "No active firewall connections were returned." : "No connections match this filter."}</td></tr>}
                                </tbody></table></div>
                                {routerOs.connections.truncated && <p className="muted inventory-empty">Showing the first {routerOs.connections.items.length} of {routerOs.connections.total} active connections.</p>}
                            </>}
                        </section>
                        <section className="chart-card">
                            <div className="chart-heading history-chart-heading"><div><span className="eyebrow">PERFORMANCE</span><h2>CPU utilization</h2><p>Recent SNMP samples from this device</p><small className="history-caption">Showing {selectedWindowLabel} across CPU, RAM, and traffic · data availability depends on metric retention.</small></div><div className="history-controls"><label>Period<select value={selectedWindow} onChange={updateHistoryWindow}><option value="custom">Custom</option>{HISTORY_WINDOWS.map(([label, seconds]) => <option key={seconds} value={seconds}>{label}</option>)}</select></label>{selectedWindow === "custom" && <form className="custom-range-form" onSubmit={applyCustomRange}><label>Days<input aria-label="Custom period days" type="number" min="0" max="180" step="1" value={customDays} onChange={(event) => setCustomDays(event.target.value)} /></label><label>Hours<input aria-label="Custom period hours" type="number" min="0" max="4319" step="1" value={customHours} onChange={(event) => setCustomHours(event.target.value)} /></label><button className="button button-quiet" type="submit">Apply</button></form>}</div></div>
                            {customRangeError && <div className="notice-error history-range-error" role="alert">{customRangeError}</div>}
                            {cpuHistory.length === 0 ? <div className="chart-empty">CPU history will appear after the next successful poll.</div> : <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={cpuHistory} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}><CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} minTickGap={40} /><YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8ecf2", boxShadow: "0 8px 24px #1c27400f" }} formatter={(value) => [`${value}%`, "CPU"]} /><Line type="monotone" dataKey="cpu" stroke="#5478ed" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#5478ed" }} /></LineChart></ResponsiveContainer></div>}
                        </section>
                        {deviceMetrics?.cpuCores?.length > 0 && <section className="chart-card inventory-card">
                            <div className="chart-heading"><div><span className="eyebrow">PROCESSOR DETAIL</span><h2>CPU cores <span className="count-pill">{deviceMetrics.cpuCores.length}</span></h2><p>Per-core utilization reported by HOST-RESOURCES-MIB.</p></div></div>
                            <div className="cpu-core-grid">{deviceMetrics.cpuCores.map((core) => {
                                const load = Number(core.load) / 10;
                                return <div className="cpu-core-card" key={core.index}><div><strong>Core {core.index}</strong><span>{load.toFixed(1)}%</span></div><div className="cpu-core-track"><i style={{ width: `${Math.min(100, Math.max(0, load))}%` }} /></div></div>;
                            })}</div>
                        </section>}
                        {memoryHistory.length > 0 && <section className="chart-card">
                            <div className="chart-heading"><div><span className="eyebrow">MEMORY HISTORY</span><h2>RAM utilization</h2><p>Recent usage samples from HOST-RESOURCES-MIB.</p></div></div>
                            <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={memoryHistory} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}><CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} minTickGap={40} /><YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} /><Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "RAM"]} /><Line type="monotone" dataKey="usedPercent" name="RAM used" stroke="#d29b42" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
                        </section>}
                        <section className="chart-card traffic-card">
                            <div className="chart-heading"><div><span className="eyebrow">INTERFACE MONITORING</span><h2>Network traffic</h2><p>Inbound and outbound throughput</p></div>{interfaces.length > 0 && <select className="interface-select" value={selectedInterface} onChange={(event) => setSelectedInterface(event.target.value)}>{interfaces.map((item) => <option key={item.index} value={item.index}>{item.name || `Interface ${item.index}`}</option>)}</select>}</div>
                            {interfaces.length === 0 || traffic.length === 0 ? <div className="chart-empty">Interface traffic will appear after successful SNMP polling.<div className="chart-legend"><span><i className="legend-blue" />Inbound</span><span><i className="legend-green" />Outbound</span></div></div> : <><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={traffic} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}><CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} minTickGap={40} /><YAxis tickFormatter={formatRate} tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} /><Tooltip formatter={(value) => [formatRate(value)]} labelStyle={{ color: "#5c6678" }} contentStyle={{ borderRadius: 10, border: "1px solid #e8ecf2" }} /><Line type="monotone" dataKey="inbound" name="Inbound" stroke="#5478ed" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="outbound" name="Outbound" stroke="#31b887" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-blue" />Inbound</span><span><i className="legend-green" />Outbound</span><span className="legend-unit">bits per second</span></div></>}
                        </section>
                        <section className="chart-card inventory-card">
                            <div className="chart-heading"><div><span className="eyebrow">INTERFACE INVENTORY</span><h2><Router size={17} />Network ports <span className="count-pill">{interfaces.length}</span></h2><p>Link state, addressing, capacity, and cumulative packet/error counters.</p></div></div>
                            <div className="table-wrap"><table className="device-table phase2-table interface-inventory-table">
                                <thead><tr><th>INTERFACE</th><th>TYPE / MTU</th><th>ADMIN / LINK</th><th>IP ADDRESS</th><th>SPEED</th><th>RX / TX</th><th>ERRORS</th><th>DISCARDS</th><th>MAC ADDRESS</th></tr></thead>
                                <tbody>{interfaces.map((item) => <tr key={item.index}>
                                    <td><strong>{item.name ?? `Interface ${item.index}`}</strong>{item.alias && <small className="cell-subtitle">{item.alias}</small>}</td>
                                    <td>{interfaceType(item.type)}<small className="cell-subtitle">{item.mtu ? `MTU ${Number(item.mtu).toLocaleString()}` : "MTU —"}</small></td>
                                    <td>{statusLabel(item.adminStatus)} / {statusLabel(item.status)}</td>
                                    <td>{item.addresses ?? "—"}</td>
                                    <td>{item.speed ? formatRate(Number(item.speed)) : "—"}</td>
                                    <td>{Number(item.inPackets ?? 0).toLocaleString()} / {Number(item.outPackets ?? 0).toLocaleString()} pkts</td>
                                    <td>{Number(item.inErrors ?? 0).toLocaleString()} / {Number(item.outErrors ?? 0).toLocaleString()}</td>
                                    <td>{Number(item.inDiscards ?? 0).toLocaleString()} / {Number(item.outDiscards ?? 0).toLocaleString()}</td>
                                    <td>{item.mac ?? "—"}</td>
                                </tr>)}
                                {interfaces.length === 0 && <tr><td colSpan="9" className="table-empty">No interface information has been collected yet.</td></tr>}</tbody>
                            </table></div>
                        </section>
                                                <section className="chart-card inventory-card">
                            <div className="chart-heading">
                                <div>
                                    <span className="eyebrow">AVAILABILITY HISTORY</span>
                                    <h2>Outage log <span className="count-pill">{filteredEvents.length}</span></h2>
                                    <p>All qualifying outages are stored. Showing the latest 10 by default; use filters to narrow the list.</p>
                                </div>
                                <div className="section-controls device-filters" style={{ flexWrap: "wrap", gap: 8 }}>
                                    <label className="search-control">
                                        <input
                                            type="search"
                                            value={eventSearch}
                                            onChange={(e) => setEventSearch(e.target.value)}
                                            placeholder="Search subject or detail"
                                            aria-label="Search outage log"
                                        />
                                    </label>
                                    <select
                                        value={eventTypeFilter}
                                        onChange={(e) => setEventTypeFilter(e.target.value)}
                                        aria-label="Filter by outage type"
                                    >
                                        <option value="ALL">All types</option>
                                        <option value="device">Device</option>
                                        <option value="interface">Port / interface</option>
                                    </select>
                                    <select
                                        value={eventStatusFilter}
                                        onChange={(e) => setEventStatusFilter(e.target.value)}
                                        aria-label="Filter by status"
                                    >
                                        <option value="ALL">All statuses</option>
                                        <option value="open">Still down</option>
                                        <option value="resolved">Recovered</option>
                                    </select>
                                    <button
                                        className="button button-quiet"
                                        type="button"
                                        onClick={() => setEventShowAll((v) => !v)}
                                    >
                                        {eventShowAll ? "Show 10 latest" : `Show all (${filteredEvents.length})`}
                                    </button>
                                </div>
                            </div>
                            <div className="table-wrap">
                                <table className="device-table phase2-table outage-table">
                                    <thead>
                                        <tr>
                                            <th>DEVICE / PORT</th>
                                            <th>OUTAGE START</th>
                                            <th>RECOVERY</th>
                                            <th>DURATION</th>
                                            <th>DETAIL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleEvents.map((event) => (
                                            <tr key={event.id}>
                                                <td>
                                                    <strong>
                                                        {event.type === "device-outage" ? "Device" : "Port"}: {event.subject}
                                                    </strong>
                                                </td>
                                                <td>{formatDate(event.startedAt)}</td>
                                                <td>
                                                    {event.resolvedAt
                                                        ? formatDate(event.resolvedAt)
                                                        : <span className="outage-active">Still down</span>}
                                                </td>
                                                <td>{formatDuration(event.startedAt, event.resolvedAt ?? new Date())}</td>
                                                <td>{event.message}</td>
                                            </tr>
                                        ))}
                                        {filteredEvents.length === 0 && (
                                            <tr>
                                                <td colSpan="5" className="table-empty">
                                                    {deviceEvents.length === 0
                                                        ? "No outages have been recorded since event logging was enabled."
                                                        : "No outages match these filters."}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {!eventShowAll && filteredEvents.length > 10 && (
                                <p className="form-help" style={{ marginTop: 8 }}>
                                    Showing 10 of {filteredEvents.length} matching events.
                                </p>
                            )}
                        </section>
                        <div className="detail-footer"><Gauge size={15} />Polling every 30 seconds <span>·</span> Last update {formatDate(device.lastSeen)}</div>
                    </>}
                </div>
            </section>
        </main>
    );
}
