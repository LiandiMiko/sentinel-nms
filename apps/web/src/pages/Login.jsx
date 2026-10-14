import { useState } from "react";
import { Activity, LogIn } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function Login() {
    const { user, loading, login } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (!loading && user) return <Navigate to="/" replace />;

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            await login(email, password);
            const destination = location.state?.from?.pathname || "/";
            navigate(destination, { replace: true });
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Sign in failed. Check the API connection.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                <div className="auth-brand"><span className="brand-mark"><Activity size={20} /></span><strong>sentinel<span className="brand-light">nms</span></strong></div>
                <span className="eyebrow">NETWORK OPERATIONS</span>
                <h1>Sign in</h1>
                <p>Use your Sentinel NMS account to continue.</p>
                {error && <div className="notice-error" role="alert">{error}</div>}
                <form className="auth-form" onSubmit={submit}>
                    <label>Email<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength="254" /></label>
                    <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength="128" /></label>
                    <button className="button button-primary" type="submit" disabled={submitting || loading}>
                        <LogIn size={16} />{submitting ? "Signing in..." : "Sign in"}
                    </button>
                </form>
            </section>
        </main>
    );
}
