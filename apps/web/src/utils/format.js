export function formatUptime(value) {
    if (!value) return "-";

    const totalSeconds = Math.floor(Number(value) / 100);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
}

export function formatCpu(value) {
    if (!value) return "-";

    return `${Number(value) / 10}%`;
}

export function formatLastSeen(date) {
    if (!date) return "-";

    return new Date(date).toLocaleString();
}