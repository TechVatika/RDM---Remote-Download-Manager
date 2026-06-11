import { useEffect, useMemo, useRef, useState } from 'react';
import { HiMagnifyingGlass, HiXMark } from 'react-icons/hi2';
import PlatformIcon from './PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';
import { statusClass } from '../utils/format.js';
import { downloadDisplayName } from '../utils/downloadDisplay.js';

export default function GlobalSearch({ downloads, onSelect, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return downloads
      .filter((d) => Number(d.private) !== 1)
      .filter((d) =>
        (d.filename || d.title || '').toLowerCase().includes(q) ||
        (d.url || '').toLowerCase().includes(q) ||
        (d.file_path || '').toLowerCase().includes(q) ||
        String(d.id).includes(q),
      )
      .slice(0, 12);
  }, [downloads, query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        wrapRef.current?.querySelector('input')?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (item) => {
    onSelect?.(item);
    setQuery('');
    setOpen(false);
    if (['queued', 'downloading', 'paused'].includes(item.status)) onNavigate('active');
    else onNavigate('history');
  };

  return (
    <div className={`global-search ${open ? 'is-open' : ''}`} ref={wrapRef}>
      <HiMagnifyingGlass size={18} className="global-search-icon" />
      <input
        type="search"
        className="global-search-input"
        placeholder="Search downloads…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-label="Search downloads"
      />
      {!query && <kbd className="global-search-kbd" aria-hidden>Ctrl K</kbd>}
      {query && (
        <button type="button" className="global-search-clear" onClick={() => setQuery('')} aria-label="Clear">
          <HiXMark size={16} />
        </button>
      )}
      {open && query.trim() && (
        <div className="global-search-results">
          {results.length === 0 ? (
            <p className="global-search-empty">No downloads match &quot;{query}&quot;</p>
          ) : (
            results.map((item) => (
              <button key={item.id} type="button" className="global-search-item" onClick={() => pick(item)}>
                <PlatformIcon name={detectPlatformFromUrl(item.url)} size={18} />
                <div className="global-search-item-body">
                  <strong>{downloadDisplayName(item)}</strong>
                  <span>#{item.id} · {item.category}</span>
                </div>
                <span className={statusClass(item.status)}>{item.status}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
