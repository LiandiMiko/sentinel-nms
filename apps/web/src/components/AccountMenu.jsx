import { LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useTheme } from "../theme/useTheme";

export default function AccountMenu() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [error, setError] = useState("");

    async function signOut() {
        setError("");
        try {
            await logout();
            navigate("/login", { replace: true });
        } catch (requestError) {
            setError(requestError.response?.data?.message ?? "Could not sign out. Check the API connection.");
        }
    }

    if (!user) return null;
    return (
        <details className="account-menu">
            <summary aria-label="Account menu"><span className="avatar"><UserRound size={15} /></span><span>{user.email}</span></summary>
            <div className="account-menu-popover">
                <strong>{user.email}</strong>
                <small>{user.role.replace("_", " ")}</small>
                {error && <small role="alert">{error}</small>}
                <button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
                    {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <Link to="/account">Account & password</Link>
                {user.role === "SUPER_ADMIN" && <Link to="/users">User management</Link>}
                {user.role === "SUPER_ADMIN" && <Link to="/audit-log">Audit log</Link>}
                <button type="button" onClick={signOut}><LogOut size={14} />Sign out</button>
            </div>
        </details>
    );
}
