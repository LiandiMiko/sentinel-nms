import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Download, FileBarChart, Router, Search, Settings, ShieldAlert } from "lucide-react";
import api from "../api/client";
import AccountMenu from "../components/AccountMenu";

function dateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function Reports() {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
    const [form, setForm] = useState({ type: "metrics", format: "xlsx", from: dateString(weekAgo), to: dateString(today), deviceId: "" });
    const [devices, setDevices] = useState([]);
    const [error, setError] = useState("");
    const [exporting, setExporting] = useState(false);
    const [loadingDevices, setLoadingDevices] = useState(true);

    useEffect(() => {
        api.get("/devices")
            .then((response) => setDevices(response.data.data))
            .catch((requestError) => setError(requestError.response?.data?.message ?? "Could not load devices."))
            .finally(() => setLoadingDevices(false));
    }, []);

    function update(event) {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
    }

    async function download(event) {
        event.preventDefault();
        setError("");
        setExporting(true);
        try {
            const params = { from: form.from, to: form.to };
            if (form.type === "metrics" && form.deviceId) params.deviceId = form.deviceId;
            const response = await api.get(`/reports/${form.type}/${form.format}`, { params, responseType: "blob" });
            const contentType = form.format === "xlsx"
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "application/pdf";
            const blob = new Blob([response.data], { type: contentType });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `sentinel-${form.type}-${form.from}-to-${form.to}.${form.format}`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (requestError) {
            let message = requestError.response?.data?.message ?? "Report export failed.";
            if (requestError.response?.data instanceof Blob) {
                try {
                    const body = JSON.parse(await requestError.response.data.text());
                    message = body.message ?? message;
                } catch {
                    message = "Report export failed. Check the selected date range and API logs.";
                }
            }
            setError(message);
        } finally {
            setExporting(false);
        }
    }

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Activity size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <Link to="/" className="side-link"><Router size={17} />Overview</Link>
                <Link to="/alerts" className="side-link"><ShieldAlert size={17} />Alerts</Link>
                <Link to="/discovery" className="side-link"><Search size={17} />Discovery</Link>
                <Link to="/reports" className="side-link active"><FileBarChart size={17} />Reports</Link>
                <Link to="/settings" className="side-link"><Settings size={17} />Settings</Link>
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>Reports</strong></div><div className="topbar-right"><AccountMenu /></div></header>
                <div className="page-content">
                    <div className="page-heading"><div><span className="eyebrow">HISTORICAL DATA</span><h1>Reports</h1><p>Export metric history and alert events as Excel workbooks or PDF.</p></div></div>
                    {error && <div className="notice-error" role="alert">{error}</div>}
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">EXPORT</span><h2><FileBarChart size={18} />Build a report</h2></div></div>
                        <form className="settings-form report-form" onSubmit={download}>
                            <label>Report data<select name="type" value={form.type} onChange={update}><option value="metrics">Metric history</option><option value="alerts">Alert history</option></select></label>
                            <label>File format<select name="format" value={form.format} onChange={update}><option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF</option></select></label>
                            <div className="form-row"><label>From<input name="from" type="date" value={form.from} onChange={update} required /></label><label>To<input name="to" type="date" value={form.to} onChange={update} required /></label></div>
                            {form.type === "metrics" && <label>Device <small>{loadingDevices ? "Loading devices..." : "Leave empty to include every device"}</small><select name="deviceId" value={form.deviceId} onChange={update} disabled={loadingDevices}><option value="">All devices</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.ipAddress})</option>)}</select></label>}
                            <p className="form-help">Date ranges are limited to 31 days. Excel exports include up to 50,000 rows; PDF exports include up to 5,000 rows.</p>
                            <button className="button button-primary" type="submit" disabled={exporting}><Download size={16} />{exporting ? "Preparing report..." : "Download report"}</button>
                        </form>
                    </section>
                </div>
            </section>
        </main>
    );
}
