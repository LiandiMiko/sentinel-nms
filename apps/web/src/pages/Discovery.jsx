import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, Plus, Router, Search, Settings, ShieldAlert } from "lucide-react";
import api from "../api/client";
import AccountMenu from "../components/AccountMenu";
import { useAuth } from "../auth/useAuth";
import EmptyState from "../components/EmptyState";

export default function Discovery() {
    const { user } = useAuth();
    const canManage = user.role !== "VIEWER";
    const [form, setForm] = useState({ cidr: "192.168.1.0/24", community: "public", port: 161, version: "2c" });
    const [results, setResults] = useState([]);
    const [error, setError] = useState("");
    const [scanning, setScanning] = useState(false);
    const [adding, setAdding] = useState("");

    function update(event) {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
    }

    async function scan(event) {
        event.preventDefault();
        setError("");
        setResults([]);
        setScanning(true);
        try {
            const response = await api.post("/discovery/scan", { ...form, port: Number(form.port) });
            setResults(response.data.data.map((device) => ({ ...device, added: false })));
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "The network scan failed.");
        } finally {
            setScanning(false);
        }
    }

    async function addDevice(device) {
        setAdding(device.ipAddress);
        setError("");
        try {
            await api.post("/devices", {
                name: device.hostname || device.ipAddress,
                ipAddress: device.ipAddress,
                community: form.community,
                snmpPort: Number(form.port),
                snmpVersion: form.version
            });
            setResults((current) => current.map((item) => (
                item.ipAddress === device.ipAddress ? { ...item, added: true } : item
            )));
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? `Could not add ${device.ipAddress}.`);
        } finally {
            setAdding("");
        }
    }

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Activity size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <Link to="/" className="side-link"><Router size={17} />Overview</Link>
                <Link to="/alerts" className="side-link"><ShieldAlert size={17} />Alerts</Link>
                <Link to="/discovery" className="side-link active"><Search size={17} />Discovery</Link>
                <Link to="/reports" className="side-link">Reports</Link>
                <Link to="/settings" className="side-link"><Settings size={17} />Settings</Link>
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>Discovery</strong></div><div className="topbar-right"><Link to="/" className="button button-quiet"><ArrowLeft size={15} />Devices</Link><AccountMenu /></div></header>
                <div className="page-content">
                    <div className="page-heading"><div><span className="eyebrow">NETWORK INVENTORY</span><h1>SNMP discovery</h1><p>Find SNMP v1/v2c devices on a private IPv4 subnet.</p></div></div>
                    <div className="notice-warning">Only scan networks you own or are authorized to monitor. Discovery is restricted to RFC1918 private ranges of at most 256 addresses.</div>
                    {error && <div className="notice-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">Dismiss</button></div>}
                    {canManage && <section className="phase2-card">
                        <form className="rule-form discovery-form" onSubmit={scan}>
                            <label>Private IPv4 network<input name="cidr" value={form.cidr} onChange={update} placeholder="192.168.1.0/24" required /></label>
                            <label>SNMP version<select name="version" value={form.version} onChange={update}><option value="2c">SNMP v2c</option><option value="1">SNMP v1</option></select></label>
                            <label>Community string<input name="community" type="password" value={form.community} onChange={update} required /></label>
                            <label>SNMP port<input name="port" type="number" min="1" max="65535" value={form.port} onChange={update} required /></label>
                            <button className="button button-primary rule-submit" type="submit" disabled={scanning}><Search size={16} />{scanning ? "Scanning..." : "Scan private network"}</button>
                        </form>
                    </section>}
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">SCAN RESULTS</span><h2>Discovered devices <span className="count-pill">{results.length}</span></h2></div></div>
                        <div className="table-wrap"><table className="device-table phase2-table"><thead><tr><th>IP ADDRESS</th><th>HOSTNAME</th><th>DESCRIPTION</th><th /></tr></thead><tbody>
                            {results.map((device) => <tr key={device.ipAddress}><td><strong>{device.ipAddress}</strong></td><td>{device.hostname}</td><td>{device.description}</td><td>{canManage && <button className="button button-quiet small-button" disabled={device.added || adding === device.ipAddress} onClick={() => addDevice(device)}>{device.added ? "Added" : adding === device.ipAddress ? "Adding..." : <><Plus size={14} />Add device</>}</button>}</td></tr>)}
                            {!results.length && <tr><td colSpan="4" className="table-empty-cell">{scanning ? <span className="loading-inline" style={{ margin: 0, border: 0, background: "transparent", justifyContent: "center" }}>Checking addresses for SNMP responses...</span> : <EmptyState icon={Search} title="No discovery results yet" description={canManage ? "Run a scan on an authorized private network range. Only private RFC1918 addresses are accepted." : "Ask an operator to run network discovery."} />}</td></tr>}
                        </tbody></table></div>
                    </section>
                </div>
            </section>
        </main>
    );
}
