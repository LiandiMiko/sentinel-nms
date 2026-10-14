import { lazy, Suspense } from "react";
import {
    BrowserRouter,
    Routes,
    Route
} from "react-router-dom";

import Dashboard from "./pages/Dashboard";
const DeviceDetail = lazy(() => import("./pages/DeviceDetail"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Settings = lazy(() => import("./pages/Settings"));
const Discovery = lazy(() => import("./pages/Discovery"));
const Reports = lazy(() => import("./pages/Reports"));

export default function App() {
    return (
        <BrowserRouter>
            <Routes>

                <Route
                    path="/"
                    element={<Dashboard />}
                />

                <Route
                    path="/device/:id"
                    element={
                        <Suspense fallback={<div className="loading-state">Loading device view...</div>}>
                            <DeviceDetail />
                        </Suspense>
                    }
                />
                <Route path="/alerts" element={<Suspense fallback={<div className="loading-state">Loading alerts...</div>}><Alerts /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<div className="loading-state">Loading settings...</div>}><Settings /></Suspense>} />
                <Route path="/discovery" element={<Suspense fallback={<div className="loading-state">Loading discovery...</div>}><Discovery /></Suspense>} />
                <Route path="/reports" element={<Suspense fallback={<div className="loading-state">Loading reports...</div>}><Reports /></Suspense>} />

            </Routes>
        </BrowserRouter>
    );
}