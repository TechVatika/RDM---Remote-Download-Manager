import { useState } from 'react';
import { HiBookmark, HiTrash, HiArrowDownTray } from 'react-icons/hi2';
import PlatformIcon from '../components/PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';
import { loadBookmarks, removeBookmark } from '../utils/bookmarks.js';
import { toastSuccess } from '../utils/swal.js';

export default function BookmarksView({ onQueueBookmark, onNavigate }) {
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks());

  const remove = (id) => {
    setBookmarks(removeBookmark(id));
    toastSuccess('Bookmark removed');
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Saved Bookmarks</h2>
        <button type="button" className="btn-secondary" onClick={() => onNavigate('new')}>
          Add from New Download
        </button>
      </div>
      <p className="settings-desc">
        Save URLs from the New Download page for one-click re-queuing. Stored locally in your browser.
      </p>

      {bookmarks.length === 0 ? (
        <div className="empty-inline">
          <HiBookmark size={32} />
          <p>No bookmarks yet. Paste a URL on New Download and click &quot;Save bookmark&quot;.</p>
        </div>
      ) : (
        <ul className="bookmark-list">
          {bookmarks.map((b) => (
            <li key={b.id} className="bookmark-item">
              <PlatformIcon name={detectPlatformFromUrl(b.url)} url={b.url} size={22} />
              <div className="bookmark-body">
                <strong title={b.url}>{b.label}</strong>
                <span>{b.category} · {new Date(b.addedAt).toLocaleDateString()}</span>
              </div>
              <div className="bookmark-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => onQueueBookmark(b)}
                >
                  <HiArrowDownTray size={15} />
                  Queue
                </button>
                <button type="button" className="btn-danger btn-sm" onClick={() => remove(b.id)}>
                  <HiTrash size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
