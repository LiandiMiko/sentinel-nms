import { useCallback, useEffect, useState } from "react";
import { Activity, Shield, Trash2, Router, ShieldAlert, Search, FileBarChart, Settings, Check } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import AccountMenu from "../components/AccountMenu";
import { useAuth } from "../auth/useAuth";

export default function Users() {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState({ email: "", password: "", role: "VIEWER" });
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadUsers = useCallback(async () => {
        try {
            const { data } = await api.get("/users");
            setUsers(data.data);
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not load users.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        api.get("/users")
            .then(({ data }) => {
                if (active) setUsers(data.data);
            })
            .catch((requestError) => {
                if (active) setError(requestError.response?.data?.message ?? "Could not load users.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    async function createUser(event) {
        event.preventDefault();
        setError("");
        setMessage("");
        setSaving(true);
        try {
            await api.post("/users", form);
            setForm({ email: "", password: "", role: "VIEWER" });
            setMessage("User created.");
            setLoading(true);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not create user.");
        } finally {
            setSaving(false);
        }
    }

    async function setEnabled(account) {
        setError("");
        try {
            await api.patch(`/users/${account.id}`, { enabled: !account.enabled });
            setLoading(true);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not update user.");
        }
    }

    async function deleteUser(account) {
        if (!window.confirm(`Delete the account ${account.email}?`)) return;
        setError("");
        try {
            await api.delete(`/users/${account.id}`);
            setMessage("User deleted.");
            setLoading(true);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not delete user.");
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
                <Link to="/reports" className="side-link"><FileBarChart size={17} />Reports</Link>
                <Link to="/settings" className="side-link"><Settings size={17} />Settings</Link>
                <Link to="/users" className="side-link active"><Shield size={17} />Users</Link>
                <Link to="/audit-log" className="side-link"><Activity size={17} />Audit log</Link>
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>User management</strong></div><AccountMenu /></header>
                <div className="page-content">
                    <div className="page-heading"><div><span className="eyebrow">ACCESS CONTROL</span><h1>User management</h1><p>Create Admin and Viewer accounts. Super Admin access is reserved for the initial account.</p></div></div>
                    {error && <div className="notice-error" role="alert">{error}</div>}
                    {message && <div className="notice-success" role="status"><Check size={16} />{message}</div>}
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">NEW ACCOUNT</span><h2>Create a user</h2></div></div>
                        <form className="user-create-form" onSubmit={createUser}>
                            <label>Email<input type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength="254" /></label>
                            <label>Temporary password<input type="password" autoComplete="new-password" minLength="12" maxLength="128" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><small>At least 12 characters. Ask the user to change it after signing in.</small></label>
                            <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="VIEWER">Viewer · read-only</option><option value="ADMIN">Admin · manage monitoring</option></select></label>
                            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating..." : "Create user"}</button>
                        </form>
                    </section>
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">ACCOUNTS</span><h2>Users <span className="count-pill">{users.length}</span></h2></div></div>
                        <div className="table-wrap"><table className="device-table phase2-table"><thead><tr><th>EMAIL</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th /></tr></thead><tbody>
                            {users.map((account) => <tr key={account.id}>
                                <td><strong>{account.email}</strong>{account.id === user.id && <small className="current-user-label">You</small>}</td>
                                <td>{account.role.replace("_", " ")}</td>
                                <td>{account.enabled ? "Enabled" : "Disabled"}</td>
                                <td>{new Date(account.createdAt).toLocaleDateString()}</td>
                                <td><div className="row-actions">
                                    {account.role !== "SUPER_ADMIN" && account.id !== user.id && <button className="button button-quiet small-button" type="button" onClick={() => setEnabled(account)}>{account.enabled ? "Disable" : "Enable"}</button>}
                                    {account.role !== "SUPER_ADMIN" && account.id !== user.id && <button className="icon-button danger-hover" type="button" title={`Delete ${account.email}`} onClick={() => deleteUser(account)}><Trash2 size={15} /></button>}
                                </div></td>
                            </tr>)}
                            {!users.length && <tr><td colSpan="5" className="table-empty">{loading ? "Loading user accounts..." : "No user accounts yet."}</td></tr>}
                        </tbody></table></div>
                    </section>
                </div>
            </section>
        </main>
    );
}
