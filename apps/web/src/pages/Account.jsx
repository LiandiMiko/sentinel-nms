import { useState } from "react";
import { Activity, ArrowLeft, Check, Router, ShieldAlert, Search, FileBarChart, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import AccountMenu from "../components/AccountMenu";
import { useAuth } from "../auth/useAuth";

export default function Account() {
    const { user } = useAuth();
    const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError("");
        setMessage("");
        if (form.newPassword !== form.confirmPassword) {
            setError("New password and confirmation do not match.");
            return;
        }
        setSaving(true);
        try {
            await api.post("/auth/password", {
                currentPassword: form.currentPassword,
                newPassword: form.newPassword
            });
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setMessage("Password changed. Other active sessions have been signed out.");
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not change password.");
        } finally {
            setSaving(false);
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
            </aside>
            <section className="main-panel">
                <header className="topbar"><div className="breadcrumb"><Link to="/">Workspace</Link><span>/</span><strong>Account</strong></div><AccountMenu /></header>
                <div className="page-content">
                    <div className="page-heading"><div><span className="eyebrow">ACCOUNT SECURITY</span><h1>My account</h1><p>{user.email} · {user.role.replace("_", " ")}</p></div><Link to="/" className="button button-quiet"><ArrowLeft size={15} />Overview</Link></div>
                    {error && <div className="notice-error" role="alert">{error}</div>}
                    {message && <div className="notice-success" role="status"><Check size={16} />{message}</div>}
                    <section className="phase2-card">
                        <div className="phase2-section-heading"><div><span className="eyebrow">PASSWORD</span><h2>Change password</h2></div></div>
                        <form className="settings-form auth-form" onSubmit={submit}>
                            <label>Current password<input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required /></label>
                            <label>New password<input type="password" autoComplete="new-password" minLength="12" maxLength="128" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required /><small>Use 12–128 characters.</small></label>
                            <label>Confirm new password<input type="password" autoComplete="new-password" minLength="12" maxLength="128" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></label>
                            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Update password"}</button>
                        </form>
                    </section>
                </div>
            </section>
        </main>
    );
}
