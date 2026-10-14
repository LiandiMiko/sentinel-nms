import { useEffect, useState } from "react";
import { Activity, Shield, Router, ShieldAlert, Search, FileBarChart, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import AccountMenu from "../components/AccountMenu";

const PAGE_SIZE = 100;

export default function AuditLog() {
    const [page, setPage] = useState(0);
    const [data, setData] = useState({ items: [], total: 0 });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshCount, setRefreshCount] = useState(0);

    useEffect(() => {
        let active = true;
        api.get("/audit-log", { params: { limit: PAGE_SIZE, offset: page * PAGE_SIZE } })
            .then((response) => {
                if (active) setData(response.data.data);
            })
            .catch((requestError) => {
                if (active) setError(requestError.response?.data?.message ?? "Could not load audit history.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [page, refreshCount]);

    function refresh() {
        setError("");
        setLoading(true);
        setRefreshCount((count) => count + 1);
    }

    function changePage(nextPage) {
        setError("");
        setLoading(true);
        setPage(nextPage);
    }

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <Link to="/" className="brand"><span className="brand-mark"><Activity size={20} /></span><span>sentinel<span className="brand-light">nms</span></span></Link>
                <div className="sidebar-label">MONITORING</div>
                <Link to="/" className="side-link"><Router size={17} />Overview</Link>
                <Link to="/alerts" className="side-link"><ShieldAlert size={17} />Alerts</Link>
                <Link to="/discovery" className="side-link"><Search size={17} />Discovery</Link>
                <Link to="/reports" className="side-link"><FileBarChart size={17} />Reports</Link>
                <Link to="/settings" className="side-link"><Settings size={17} />Settings</Link>
                <Link to="/users" className="side-link"><Shield size={17} />Users</Link>
                <Link to="/audit-log" className="side-link active"><Activity size={17} />Audit log</Link>
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>Audit log</strong></div><div className="topbar-right"><AccountMenu /></div></header>
                <div className="page-content">
                    <div className="page-heading"><div><span className="eyebrow">SECURITY</span><h1>Audit log</h1><p>Recent state-changing API requests, including their result. Request bodies and credentials are never recorded.</p></div></div>
                    {error && <div className="notice-error" role="alert">{error}</div>}
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">ACTIVITY HISTORY</span><h2>Events <span className="count-pill">{data.total.toLocaleString()}</span></h2></div><button className="button button-quiet" type="button" onClick={refresh} disabled={loading}>Refresh</button></div>
                        <div className="table-wrap">
                            <table className="device-table phase2-table audit-table">
                                <thead><tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>RESULT</th><th>IP ADDRESS</th><th>CLIENT</th></tr></thead>
                                <tbody>
                                    {data.items.map((item) => (
                                        <tr key={item.id}>
                                            <td>{new Date(item.createdAt).toLocaleString()}</td>
                                            <td>{item.actorEmail ?? "Unauthenticated"}</td>
                                            <td><code>{item.action}</code></td>
                                            <td><span className={`audit-status ${item.status >= 400 ? "failed" : "success"}`}>{item.status}</span></td>
                                            <td>{item.ipAddress ?? "—"}</td>
                                            <td title={item.userAgent ?? ""}>{item.userAgent ?? "—"}</td>
                                        </tr>
                                    ))}
                                    {!data.items.length && <tr><td colSpan="6" className="table-empty">{loading ? "Loading audit history..." : error ? "Audit history could not be loaded." : "No audit events recorded yet."}</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <div className="audit-pagination">
                            <span>{data.total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, data.total)} of ${data.total}` : "0 events"}</span>
                            <div>
                                <button className="icon-button" type="button" aria-label="Previous page" disabled={page === 0 || loading} onClick={() => changePage(page - 1)}><ChevronLeft size={17} /></button>
                                <button className="icon-button" type="button" aria-label="Next page" disabled={(page + 1) * PAGE_SIZE >= data.total || loading} onClick={() => changePage(page + 1)}><ChevronRight size={17} /></button>
                            </div>
                        </div>
                    </section>
                </div>
            </section>
        </main>
    );
}
