import {
    BrowserRouter,
    Routes,
    Route
} from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import DeviceDetail from "./pages/DeviceDetail";

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
                    element={<DeviceDetail />}
                />

            </Routes>
        </BrowserRouter>
    );
}