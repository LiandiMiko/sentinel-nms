import { lazy, Suspense } from "react";
import {
    BrowserRouter,
    Routes,
    Route
} from "react-router-dom";

import Dashboard from "./pages/Dashboard";
const DeviceDetail = lazy(() => import("./pages/DeviceDetail"));

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

            </Routes>
        </BrowserRouter>
    );
}