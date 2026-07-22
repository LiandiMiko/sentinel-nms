import { useEffect, useState } from "react";
import { getSummary, getDevices } from "../api/dashboard";
import { Link } from "react-router-dom";


export default function Dashboard() {
    const [summary, setSummary] = useState(null);
    const [devices, setDevices] = useState([]);

    useEffect(() => {
        load();

        const timer = setInterval(load, 5000);

        return () => clearInterval(timer);
    }, []);

    async function load() {
        try {
            const [summaryData, deviceData] = await Promise.all([
                getSummary(),
                getDevices()
            ]);

            setSummary(summaryData);
            setDevices(deviceData);
        } catch (err) {
            console.error(err);
        }
    }

    if (!summary) {
        return <h2>Loading Sentinel NMS...</h2>;
    }

    return (
        <div style={{ padding: 30, fontFamily: "Arial" }}>
            <h1>Sentinel NMS Dashboard</h1>

            <hr />

            <h2>Summary</h2>

            <ul>
                <li>Total Device : {summary.totalDevices}</li>
                <li>Online : {summary.upDevices}</li>
                <li>Offline : {summary.downDevices}</li>
                <li>Total Metric : {summary.totalMetrics}</li>
                <li>Last Polling : {summary.lastPolling}</li>
            </ul>

            <hr />

            <h2>Devices</h2>

            <table border="1" cellPadding="10">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>IP</th>
                        <th>Status</th>
                        <th>Last Seen</th>
                    </tr>
                </thead>

                <tbody>
                    {devices.map((device) => (
                        <tr key={device.id}>
                            <td>
                                <Link
                                    to={`/device/${device.id}`}
                                    className="text-blue-500 hover:underline"
                            >
                                    {device.name}
                                </Link>
                            </td>
                            <td>{device.ipAddress}</td>
                            <td>{device.status}</td>
                            <td>{device.lastSeen}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}