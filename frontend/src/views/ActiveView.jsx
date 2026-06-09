import EmptyState from '../components/EmptyState.jsx';

import ServerDownloadBanner from '../components/ServerDownloadBanner.jsx';

export default function ActiveView({
  active,
  onNavigate,
  renderDownloadItem,
  onPauseAll,
  onCancelAll,
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Active Queue ({active.length})</h2>
        {active.length > 0 && (
          <div className="panel-head-actions">
            <button type="button" className="btn-secondary" onClick={onPauseAll}>
              Pause all
            </button>
            <button type="button" className="btn-danger" onClick={onCancelAll}>
              Cancel all
            </button>
          </div>
        )}
      </div>
      <ServerDownloadBanner />
      {active.length === 0 ? (
        <EmptyState
          title="Nothing downloading"
          description="Your queue is empty. Add a URL from New Download."
          actionLabel="Add URL"
          onAction={() => onNavigate('new')}
        />
      ) : (
        <ul className="download-list">{active.map((i) => renderDownloadItem(i))}</ul>
      )}
    </section>
  );
}
