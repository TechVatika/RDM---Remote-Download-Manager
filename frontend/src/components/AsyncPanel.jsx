import EmptyState from './EmptyState.jsx';
import SectionEyebrow from './SectionEyebrow.jsx';

/** Consistent loading / error / content shell for data-fetching views. */
export default function AsyncPanel({
  title,
  tint = 'steel',
  loading,
  error,
  onRetry,
  children,
  className = '',
  action,
}) {
  if (loading) {
    return (
      <section className={`panel ${className}`.trim()}>
        {title ? <SectionEyebrow title={title} tint={tint} action={action} /> : null}
        <div className="panel-body">
          <p className="settings-desc">Loading…</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={`panel panel-alert ${className}`.trim()}>
        {title ? <SectionEyebrow title={title} tint="salmon" action={action} /> : null}
        <div className="panel-body">
          <p className="download-error">{error}</p>
          {onRetry && (
            <button type="button" className="btn-secondary" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </section>
    );
  }

  return children;
}

export function PanelEmpty({ title, description, actionLabel, onAction }) {
  return (
    <EmptyState
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
