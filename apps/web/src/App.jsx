import { lazy, Suspense } from "react";
import {
    BrowserRouter,
    Navigate,
    Routes,
    Route,
    useLocation
} from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/useAuth";
import { ThemeProvider } from "./theme/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
const DeviceDetail = lazy(() => import("./pages/DeviceDetail"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Settings = lazy(() => import("./pages/Settings"));
const Discovery = lazy(() => import("./pages/Discovery"));
const Reports = lazy(() => import("./pages/Reports"));
const Users = lazy(() => import("./pages/Users"));
const Account = lazy(() => import("./pages/Account"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Performance = lazy(() => import("./pages/Performance"));

function RequireAuth({ children, role }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) return <div className="loading-state">Checking session...</div>;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    if (role && user.role !== role) return <Navigate to="/" replace />;
    return children;
}

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
                    <Route path="/device/:id" element={<RequireAuth><Suspense fallback={<div className="loading-state">Loading device view...</div>}><DeviceDetail /></Suspense></RequireAuth>} />
                    <Route path="/alerts" element={<RequireAuth><Suspense fallback={<div className="loading-state">Loading alerts...</div>}><Alerts /></Suspense></RequireAuth>} />
                    <Route path="/settings" element={<RequireAuth><Suspense fallback={<div className="loading-state">Loading settings...</div>}><Settings /></Suspense></RequireAuth>} />
                    <Route path="/discovery" element={<RequireAuth><Suspense fallback={<div className="loading-state">Loading discovery...</div>}><Discovery /></Suspense></RequireAuth>} />
                    <Route path="/reports" element={<RequireAuth><Suspense fallback={<div className="loading-state">Loading reports...</div>}><Reports /></Suspense></RequireAuth>} />
                    <Route path="/performance" element={<RequireAuth><Suspense fallback={<div className="loading-state">Loading performance...</div>}><Performance /></Suspense></RequireAuth>} />
                    <Route path="/users" element={<RequireAuth role="SUPER_ADMIN"><Suspense fallback={<div className="loading-state">Loading users...</div>}><Users /></Suspense></RequireAuth>} />
                    <Route path="/audit-log" element={<RequireAuth role="SUPER_ADMIN"><Suspense fallback={<div className="loading-state">Loading audit log...</div>}><AuditLog /></Suspense></RequireAuth>} />
                    <Route path="/account" element={<RequireAuth><Suspense fallback={<div className="loading-state">Loading account...</div>}><Account /></Suspense></RequireAuth>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ThemeProvider>
    );
}