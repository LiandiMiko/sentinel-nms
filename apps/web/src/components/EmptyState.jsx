export default function EmptyState({ icon: Icon, title, description, action }) {
    return (
        <div className="empty-state" role="status">
            {Icon ? <div className="empty-icon"><Icon size={22} /></div> : null}
            <strong>{title}</strong>
            {description ? <p>{description}</p> : null}
            {action ? <div className="empty-state-action">{action}</div> : null}
        </div>
    );
}
