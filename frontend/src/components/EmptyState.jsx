import { HiPlusCircle, HiInboxArrowDown } from 'react-icons/hi2';

export default function EmptyState({ icon: Icon = HiInboxArrowDown, title, description, actionLabel, onAction }) {
  return (
    <div className="empty-state-card">
      <div className="empty-state-icon">
        <Icon size={32} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn-primary" onClick={onAction}>
          <HiPlusCircle size={18} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function StatCard({ label, value, accent, icon: Icon, className = '' }) {
  return (
    <div className={`stat-card ${accent} ${className}`.trim()}>
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className="stat-icon">
            <Icon size={20} />
          </span>
        )}
      </div>
      <strong>{value}</strong>
    </div>
  );
}
