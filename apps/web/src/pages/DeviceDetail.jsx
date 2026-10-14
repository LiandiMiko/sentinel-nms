import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock3, Cpu, Gauge, Router, Signal, Wifi } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDevice } from "../api/dashboard";
import { getMetricHistory, getInterfaces } from "../api/metric";
import { formatDate, formatUptime } from "../utils/format";

function asTraffic(history) {
    return history.map((item, index) => {
        if (index === 0) return { ...item, rate: 0 };
        const previous = history[index - 1];
        const seconds = (new Date(item.createdAt) - new Date(previous.createdAt)) / 1000;
        const difference = Number(item.value) - Number(previous.value);
        return {
            ...item,
            rate: seconds > 0 && difference >= 0 ? difference * 8 / seconds : 0
        };
    });
}

function formatRate(value) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)} Kbps`;
    return `${Math.round(value)} bps`;
}

export default function DeviceDetail() {
    const { id } = useParams();
    const [device, setDevice] = useState(null);
    const [cpuHistory, setCpuHistory] = useState([]);
    const [interfaces, setInterfaces] = useState([]);
    const [selectedInterface, setSelectedInterface] = useState("");
    const [traffic, setTraffic] = useState([]);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const [deviceData, history, interfaceData] = await Promise.all([
                getDevice(id),
                getMetricHistory(id, "cpu"),
                getInterfaces(id)
            ]);
            const isOnline = deviceData.enabled && deviceData.lastSeen
                && Date.now() - new Date(deviceData.lastSeen).getTime() < 90000;
            setDevice({
                ...deviceData,
                status: !deviceData.enabled ? "DISABLED" : isOnline ? "UP" : "DOWN"
            });
            setCpuHistory(history.map((item) => ({
                time: new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                cpu: Number(item.value) / 10,
                createdAt: item.createdAt
            })));
            setInterfaces(interfaceData);
            setSelectedInterface((current) => current || interfaceData[0]?.index || "");
            setError("");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not load device information.");
        }
    }, [id]);

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
            getMetricHistory(id, `interface.${selectedInterface}.inOctets`),
            getMetricHistory(id, `interface.${selectedInterface}.outOctets`)
        ]).then(([input, output]) => {
            const inbound = asTraffic(input);
            const outbound = asTraffic(output);
            const points = new Map();
            inbound.forEach((item) => points.set(item.createdAt, {
                time: new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                inbound: item.rate,
                createdAt: item.createdAt
            }));
            outbound.forEach((item) => {
                const point = points.get(item.createdAt) ?? {
                    time: new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    createdAt: item.createdAt
                };
                point.outbound = item.rate;
                points.set(item.createdAt, point);
            });
            setTraffic([...points.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
        }).catch((requestError) => {
            setError(requestError.response?.data?.message ?? "Could not load interface traffic history.");
        });
    }, [id, selectedInterface]);

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
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>{device?.name ?? "Device"}</strong></div><div className="topbar-right"><span className="refresh-note"><i />Auto-refresh · 15s</span><span className="avatar">NA</span></div></header>
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
                        </div>
                        <section className="chart-card">
                            <div className="chart-heading"><div><span className="eyebrow">PERFORMANCE</span><h2>CPU utilization</h2><p>Recent SNMP samples from this device</p></div><span className="chart-period"><span />Live · 15s</span></div>
                            {cpuHistory.length === 0 ? <div className="chart-empty">CPU history will appear after the next successful poll.</div> : <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={cpuHistory} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}><CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} minTickGap={40} /><YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e8ecf2", boxShadow: "0 8px 24px #1c27400f" }} formatter={(value) => [`${value}%`, "CPU"]} /><Line type="monotone" dataKey="cpu" stroke="#5478ed" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#5478ed" }} /></LineChart></ResponsiveContainer></div>}
                        </section>
                        <section className="chart-card traffic-card">
                            <div className="chart-heading"><div><span className="eyebrow">INTERFACE MONITORING</span><h2>Network traffic</h2><p>Inbound and outbound throughput</p></div>{interfaces.length > 0 && <select className="interface-select" value={selectedInterface} onChange={(event) => setSelectedInterface(event.target.value)}>{interfaces.map((item) => <option key={item.index} value={item.index}>{item.name || `Interface ${item.index}`}</option>)}</select>}</div>
                            {interfaces.length === 0 || traffic.length === 0 ? <div className="chart-empty">Interface traffic will appear after successful SNMP polling.<div className="chart-legend"><span><i className="legend-blue" />Inbound</span><span><i className="legend-green" />Outbound</span></div></div> : <><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={traffic} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}><CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} minTickGap={40} /><YAxis tickFormatter={formatRate} tickLine={false} axisLine={false} tick={{ fill: "#8a94a6", fontSize: 11 }} /><Tooltip formatter={(value) => [formatRate(value)]} labelStyle={{ color: "#5c6678" }} contentStyle={{ borderRadius: 10, border: "1px solid #e8ecf2" }} /><Line type="monotone" dataKey="inbound" name="Inbound" stroke="#5478ed" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="outbound" name="Outbound" stroke="#31b887" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-blue" />Inbound</span><span><i className="legend-green" />Outbound</span><span className="legend-unit">bits per second</span></div></>}
                        </section>
                        <div className="detail-footer"><Gauge size={15} />Polling every 30 seconds <span>·</span> Last update {formatDate(device.lastSeen)}</div>
                    </>}
                </div>
            </section>
        </main>
    );
}
