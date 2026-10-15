import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
    Activity, BarChart2, Download, FileBarChart, RefreshCw, Router,
    Search, Settings, ShieldAlert, X
} from "lucide-react";
import {
    CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import AccountMenu from "../components/AccountMenu";
import { useAuth } from "../auth/useAuth";
import api from "../api/client";

/* ── helpers ── */

function arrayToCsv(data) {
    if (!data || data.length === 0) return "";
    const header = Object.keys(data[0]).join(",");
    const rows = data.map(row => Object.values(row).join(","));
    return [header, ...rows].join("\n");
}

function formatTime(ts) {
    const d = new Date(typeof ts === "number" ? ts : Date.parse(ts));
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(ts) {
    const d = new Date(typeof ts === "number" ? ts : Date.parse(ts));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const RANGES = [
    { label: "1 h", seconds: 3600 },
    { label: "6 h", seconds: 21600 },
    { label: "24 h", seconds: 86400 },
    { label: "7 d", seconds: 604800 },
];

/* ── component ── */

export default function Performance() {
    const { user } = useAuth();
    const [deviceId, setDeviceId] = useState("");
    const [devices, setDevices] = useState([]);
    const [loadingDevices, setLoadingDevices] = useState(true);
    const [metric, setMetric] = useState("ping.latency");
    const [rangeSeconds, setRangeSeconds] = useState(86400);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // load device list once
    useEffect(() => {
        api.get("/devices")
            .then(res => setDevices(res.data.data))
            .catch(err => setError(err.response?.data?.message ?? "Failed to load devices"))
            .finally(() => setLoadingDevices(false));
    }, []);

    const loadData = useCallback(async () => {
        if (!deviceId) return;
        setLoading(true);
        setError("");
        try {
            const params = { name: metric, rangeSeconds, maxPoints: 200 };
            const response = await api.get(`/metrics/device/${deviceId}/historyWindow`, { params });
            const raw = response.data.data ?? [];
            // normalise for chart – the repo returns { value, createdAt, … }
            const chart = raw.map(row => ({
                time: typeof row.createdAt === "number" ? row.createdAt : new Date(row.createdAt).getTime(),
                value: Number(row.value),
                name: row.name,
            }));
            setData(chart);
        } catch (err) {
            setError(err.response?.data?.message ?? "Failed to load metric history");
        } finally {
            setLoading(false);
        }
    }, [deviceId, metric, rangeSeconds]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const exportCsv = () => {
        const csv = arrayToCsv(data.map(r => ({
            timestamp: formatDateTime(r.time),
            value: r.value,
            metric: r.name,
        })));
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `performance-${metric}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const metricUnit = metric === "ping.latency" ? "ms" : "%";
    const metricLabel = metric === "ping.latency" ? "Latency (ms)" : "Packet loss (%)";

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand">
                    <span className="brand-mark"><Activity size={20} /></span>
                    <span>sentinel<span className="brand-light">nms</span></span>
                </Link>
                <div className="sidebar-label">MONITORING</div>
                <Link to="/" className="side-link"><Activity size={17} />Overview</Link>
                <Link to="/alerts" className="side-link"><ShieldAlert size={17} />Alerts</Link>
                <Link to="/discovery" className="side-link"><Search size={17} />Discovery</Link>
                <Link to="/performance" className="side-link active"><BarChart2 size={17} />Performance</Link>
                <Link to="/reports" className="side-link"><FileBarChart size={17} />Reports</Link>
                <Link to="/settings" className="side-link"><Settings size={17} />Settings</Link>
                <div className="sidebar-bottom">
                    <span className="live-indicator"><i />Monitoring active</span>
                    <small>Sentinel NMS · MVP</small>
                </div>
            </aside>
            <section className="main-panel">
                <header className="topbar">
                    <div className="breadcrumb">
                        <Link to="/">Workspace</Link> <span>/</span> <strong>Performance</strong>
                    </div>
                    <div className="topbar-right"><AccountMenu /></div>
                </header>
                <div className="page-content" id="performance">
                    <div className="page-heading">
                        <div>
                            <span className="eyebrow">HISTORICAL METRICS</span>
                            <h1>Performance Dashboard</h1>
                            <p>View latency &amp; packet‑loss trends over selectable time ranges, then export to CSV.</p>
                        </div>
                    </div>
                    {error && (
                        <div className="notice-error" role="alert">
                            {error}
                            <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button>
                        </div>
                    )}
                    <section className="phase2-card">
                        <div className="phase2-section-heading">
                            <div><span className="eyebrow">CONTROLS</span><h2><BarChart2 size={18} /> Chart controls</h2></div>
                        </div>
                        <div className="rule-form" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
                            <label>Device
                                <select value={deviceId} onChange={e => setDeviceId(e.target.value)} disabled={loadingDevices}>
                                    <option value="">{loadingDevices ? "Loading…" : "Select a device"}</option>
                                    {devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.ipAddress})</option>)}
                                </select>
                            </label>
                            <label>Metric
                                <select value={metric} onChange={e => setMetric(e.target.value)}>
                                    <option value="ping.latency">Ping latency (ms)</option>
                                    <option value="ping.packetLoss">Packet loss (%)</option>
                                </select>
                            </label>
                            <label>Time range
                                <select value={rangeSeconds} onChange={e => setRangeSeconds(Number(e.target.value))}>
                                    {RANGES.map(r => <option key={r.seconds} value={r.seconds}>{r.label}</option>)}
                                </select>
                            </label>
                            <button className="button button-primary" onClick={loadData} disabled={loading || !deviceId}>
                                <RefreshCw size={16} className={loading ? "spin" : ""} />{loading ? "Loading…" : "Refresh"}
                            </button>
                            {data.length > 0 && (
                                <button className="button button-quiet" onClick={exportCsv}>
                                    <Download size={16} /> Export CSV
                                </button>
                            )}
                        </div>
                    </section>

                    <section className="phase2-card" style={{ marginTop: "1rem" }}>
                        <div className="phase2-section-heading">
                            <div>
                                <span className="eyebrow">TREND</span>
                                <h2>{metricLabel}</h2>
                            </div>
                            {data.length > 0 && <small>{data.length} data points</small>}
                        </div>
                        {data.length === 0 ? (
                            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted, #888)" }}>
                                {!deviceId
                                    ? "Select a device above to view performance trends."
                                    : loading
                                        ? "Loading data…"
                                        : "No data available for the selected range."}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={340}>
                                <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #333)" />
                                    <XAxis
                                        dataKey="time"
                                        type="number"
                                        domain={["dataMin", "dataMax"]}
                                        tickFormatter={rangeSeconds <= 86400 ? formatTime : formatDateTime}
                                        stroke="var(--text-muted, #888)"
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis
                                        stroke="var(--text-muted, #888)"
                                        tick={{ fontSize: 11 }}
                                        unit={` ${metricUnit}`}
                                    />
                                    <Tooltip
                                        labelFormatter={formatDateTime}
                                        formatter={(v) => [`${Number(v).toFixed(2)} ${metricUnit}`, metricLabel]}
                                        contentStyle={{ background: "var(--card-bg, #1a1a2e)", border: "1px solid var(--border, #333)" }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke={metric === "ping.latency" ? "#6366f1" : "#f59e0b"}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </section>
                </div>
            </section>
        </main>
    );
}
