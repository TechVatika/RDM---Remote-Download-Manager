import EmptyState from '../components/EmptyState.jsx';
import SectionEyebrow from '../components/SectionEyebrow.jsx';
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
      <SectionEyebrow
        title={`ACTIVE QUEUE (${active.length})`}
        tint="sky"
        action={
          active.length > 0 ? (
            <div className="panel-head-actions">
              <button type="button" className="btn-secondary" onClick={onPauseAll}>
                Pause all
              </button>
              <button type="button" className="btn-danger" onClick={onCancelAll}>
                Cancel all
              </button>
            </div>
          ) : null
        }
      />
      <div className="panel-body">
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
      </div>
    </section>
  );
}
