import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BellRing, CirclePlus, FileBarChart, Router, Search, Settings, ShieldAlert, Trash2 } from "lucide-react";
import AccountMenu from "../components/AccountMenu";
import { useAuth } from "../auth/useAuth";
import {
    acknowledgeAlert,
    createAlertRule,
    deleteAlertRule,
    getAlertEvents,
    getAlertRules,
    getChannels,
    getGroups,
    updateAlertRule
} from "../api/phase2";
import { formatDate } from "../utils/format";

const initialRule = {
    name: "",
    type: "CPU_ABOVE",
    severity: "HIGH",
    threshold: 80,
    durationSeconds: 0,
    enabled: true,
    groupId: "",
    channelIds: []
};

export default function Alerts() {
    const { user } = useAuth();
    const canManage = user.role !== "VIEWER";
    const [rules, setRules] = useState([]);
    const [events, setEvents] = useState([]);
    const [channels, setChannels] = useState([]);
    const [groups, setGroups] = useState([]);
    const [form, setForm] = useState(initialRule);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [stateFilter, setStateFilter] = useState("");

    const load = useCallback(async () => {
        try {
            const [ruleData, eventData, channelData, groupData] = await Promise.all([
                getAlertRules(),
                getAlertEvents(stateFilter),
                getChannels(),
                getGroups()
            ]);
            setRules(ruleData);
            setEvents(eventData);
            setChannels(channelData);
            setGroups(groupData.groups);
            setError("");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not load alert data.");
        }
    }, [stateFilter]);

    useEffect(() => {
        const timer = setTimeout(load, 0);
        return () => clearTimeout(timer);
    }, [load]);

    function update(event) {
        const { name, value } = event.target;
        setForm((previous) => ({ ...previous, [name]: value }));
    }

    async function saveRule(event) {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const rule = {
                ...form,
                threshold: form.type === "CPU_ABOVE" ? Number(form.threshold) : null,
                durationSeconds: Number(form.durationSeconds),
                groupId: form.groupId || null
            };
            await createAlertRule(rule);
            setForm(initialRule);
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not save alert rule.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleRule(rule) {
        try {
            await updateAlertRule(rule.id, { enabled: !rule.enabled });
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not update alert rule.");
        }
    }

    async function removeRule(rule) {
        if (!window.confirm(`Delete alert rule "${rule.name}" and its event history?`)) return;
        try {
            await deleteAlertRule(rule.id);
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not delete alert rule.");
        }
    }

    async function ackAlert(alert) {
        try {
            await acknowledgeAlert(alert.id);
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not acknowledge alert.");
        }
    }

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Activity size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <Link to="/" className="side-link"><Router size={17} />Overview</Link>
                <Link to="/alerts" className="side-link active"><ShieldAlert size={17} />Alerts</Link>
                <Link to="/discovery" className="side-link"><Search size={17} />Discovery</Link>
                <Link to="/reports" className="side-link"><FileBarChart size={17} />Reports</Link>
                <Link to="/settings" className="side-link"><Settings size={17} />Settings</Link>
                <div className="sidebar-bottom"><span className="live-indicator"><i />Monitoring active</span><small>Sentinel NMS · Phase 2</small></div>
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>Alerts</strong></div><div className="topbar-right"><AccountMenu /></div></header>
                <div className="page-content">
                    <div className="page-heading"><div><span className="eyebrow">INCIDENT MANAGEMENT</span><h1>Alerts</h1><p>Define thresholds and track network incidents.</p></div></div>
                    {error && <div className="notice-error" role="alert">{error}</div>}
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">AUTOMATION</span><h2><BellRing size={18} /> Alert rules</h2></div></div>
                        {canManage && <form className="rule-form" onSubmit={saveRule}>
                            <label>Rule name<input name="name" value={form.name} onChange={update} placeholder="Core router CPU high" required maxLength="100" /></label>
                            <label>Condition<select name="type" value={form.type} onChange={update}><option value="CPU_ABOVE">CPU exceeds</option><option value="DEVICE_DOWN">Device offline</option></select></label>
                            {form.type === "CPU_ABOVE" ? <label>Threshold (%)<input name="threshold" type="number" min="0" max="100" value={form.threshold} onChange={update} required /></label> : <label>Offline duration (seconds)<input name="durationSeconds" type="number" min="0" max="86400" value={form.durationSeconds} onChange={update} /></label>}
                            <label>Severity<select name="severity" value={form.severity} onChange={update}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
                            <label>Group<select name="groupId" value={form.groupId} onChange={update}><option value="">All devices</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                            <label>Notify<select multiple value={form.channelIds} onChange={(event) => setForm((previous) => ({ ...previous, channelIds: [...event.target.selectedOptions].map((option) => option.value) }))} aria-label="Notification channels">{channels.filter((channel) => channel.enabled).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>
                            <button className="button button-primary rule-submit" type="submit" disabled={saving}><CirclePlus size={16} />{saving ? "Saving..." : "Create rule"}</button>
                        </form>}
                        <div className="table-wrap">
                            <table className="device-table phase2-table">
                                <thead><tr><th>RULE</th><th>CONDITION</th><th>SEVERITY</th><th>SCOPE</th><th>CHANNELS</th><th>STATUS</th><th /></tr></thead>
                                <tbody>{rules.map((rule) => <tr key={rule.id}>
                                    <td><strong>{rule.name}</strong></td>
                                    <td>{rule.type === "CPU_ABOVE" ? `CPU > ${rule.threshold}%` : `Offline > ${rule.durationSeconds}s`}</td>
                                    <td><span className={`severity ${rule.severity.toLowerCase()}`}>{rule.severity}</span></td>
                                    <td>{rule.group?.name ?? "All devices"}</td>
                                    <td>{rule.channels.map((item) => item.channel.name).join(", ") || "None"}</td>
                                    <td>{canManage && <button className={`switch ${rule.enabled ? "on" : ""}`} type="button" onClick={() => toggleRule(rule)} aria-label={rule.enabled ? "Disable rule" : "Enable rule"}><i /></button>}</td>
                                    <td>{canManage && <button className="icon-button danger-hover" title="Delete rule" onClick={() => removeRule(rule)}><Trash2 size={15} /></button>}</td>
                                </tr>)}
                                {rules.length === 0 && <tr><td colSpan="7" className="table-empty">No alert rules created yet.</td></tr>}</tbody>
                            </table>
                        </div>
                    </section>
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">EVENT LOG</span><h2>Alert history</h2></div><select className="compact-select" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">All states</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option></select></div>
                        <div className="table-wrap"><table className="device-table phase2-table"><thead><tr><th>DEVICE</th><th>ALERT</th><th>SEVERITY</th><th>STATE</th><th>TRIGGERED</th><th /></tr></thead><tbody>
                            {events.map((alert) => <tr key={alert.id}><td><strong>{alert.deviceName}</strong><small className="cell-subtitle">{alert.deviceIpAddress}</small></td><td>{alert.message}</td><td><span className={`severity ${alert.rule.severity.toLowerCase()}`}>{alert.rule.severity}</span></td><td><span className={`state-pill ${alert.state}`}>{alert.state}</span></td><td>{formatDate(alert.triggeredAt)}</td><td>{canManage && alert.state === "open" && <button className="button button-quiet small-button" onClick={() => ackAlert(alert)}>Acknowledge</button>}</td></tr>)}
                            {events.length === 0 && <tr><td colSpan="6" className="table-empty">No alerts match this filter.</td></tr>}
                        </tbody></table></div>
                    </section>
                </div>
            </section>
        </main>
    );
}
