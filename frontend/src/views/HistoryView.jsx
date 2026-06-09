import { useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'largest', label: 'Largest size' },
  { id: 'smallest', label: 'Smallest size' },
  { id: 'name', label: 'Name (A–Z)' },
];

const sorters = {
  newest: (a, b) => b.id - a.id,
  oldest: (a, b) => a.id - b.id,
  largest: (a, b) => (Number(b.file_size) || 0) - (Number(a.file_size) || 0),
  smallest: (a, b) => (Number(a.file_size) || 0) - (Number(b.file_size) || 0),
  name: (a, b) =>
    (a.filename || a.title || a.url || '').localeCompare(b.filename || b.title || b.url || '', undefined, {
      sensitivity: 'base',
    }),
};

export default function HistoryView({
  history,
  onClearHistory,
  onRetryFailed,
  renderDownloadItem,
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  const filtered = useMemo(() => {
    const out = history.filter((d) => {
      if (Number(d.private) === 1) return false;
      if (filter !== 'all' && d.status !== filter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (d.filename || d.title || '').toLowerCase().includes(q) ||
        (d.url || '').toLowerCase().includes(q) ||
        (d.file_path || '').toLowerCase().includes(q)
      );
    });
    return out.sort(sorters[sort] || sorters.newest);
  }, [history, filter, search, sort]);

  const failedCount = history.filter((d) => d.status === 'failed').length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>History ({filtered.length})</h2>
        <div className="panel-head-actions">
          {failedCount > 0 && (
            <button type="button" className="btn-secondary" onClick={onRetryFailed}>
              Retry failed ({failedCount})
            </button>
          )}
          <button type="button" className="btn-danger" onClick={onClearHistory}>
            Clear finished
          </button>
        </div>
      </div>

      <div className="history-filters">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`category-tab ${filter === id ? 'active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="history-toolbar">
        <input
          type="search"
          className="history-search"
          placeholder="Search by title, URL, or path…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="history-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching history"
          description="Completed and failed downloads will appear here."
        />
      ) : (
        <ul className="download-list">{filtered.map((i) => renderDownloadItem(i))}</ul>
      )}
    </section>
  );
}
