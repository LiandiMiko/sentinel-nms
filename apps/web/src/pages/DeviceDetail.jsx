import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getDevice } from "../api/dashboard";
import { getCpuHistory } from "../api/metric";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from "recharts";

export default function DeviceDetail() {
    const { id } = useParams();

    const [device, setDevice] = useState(null);
    const [cpuHistory, setCpuHistory] = useState([]);

    useEffect(() => {
        load();

        const timer = setInterval(load, 5000);

        return () => clearInterval(timer);
    }, []);

    async function load() {

    const [deviceData, history] = await Promise.all([
        getDevice(id),
        getCpuHistory(id)
    ]);

    setDevice(deviceData);

    setCpuHistory(
        history.map(item => ({
            time: new Date(item.createdAt).toLocaleTimeString(),
            cpu: Number(item.value) / 10
        }))
    );

}

    if (!device) return <h2>Loading...</h2>;

    return (
        <div style={{ padding: 30 }}>
            <Link to="/">← Dashboard</Link>

            <h1>{device.name}</h1>

            <p>
                Status :
                {" "}
                {device.lastSeen
                    ? "🟢 Online"
                    : "🔴 Offline"}
            </p>

            <hr />

            <table cellPadding="8">
                <tbody>
                    <tr>
                        <td>Hostname</td>
                        <td>{device.snapshot?.hostname}</td>
                    </tr>

                    <tr>
                        <td>IP Address</td>
                        <td>{device.ipAddress}</td>
                    </tr>

                    <tr>
                        <td>CPU</td>
                        <td>{device.snapshot?.cpu}</td>
                    </tr>

                    <tr>
                        <td>Uptime</td>
                        <td>{device.snapshot?.uptime}</td>
                    </tr>

                    <tr>
                        <td>Last Seen</td>
                        <td>{device.lastSeen}</td>
                    </tr>

                    <tr>
                        <td>SNMP Version</td>
                        <td>{device.snmpVersion}</td>
                    </tr>

                    <tr>
                        <td>Community</td>
                        <td>{device.community}</td>
                    </tr>
                </tbody>
            </table>

            <hr />

<h2>CPU History</h2>

<div style={{ width: "100%", height: 320 }}>
    <ResponsiveContainer>

        <LineChart data={cpuHistory}>

            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="time" />

            <YAxis
                domain={[0,100]}
                unit="%"
            />

            <Tooltip />

            <Line
                type="monotone"
                dataKey="cpu"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
            />

        </LineChart>

    </ResponsiveContainer>
</div>
        </div>
    );
}