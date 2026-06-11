import { useState } from 'react';
import { HiBookmark, HiTrash, HiArrowDownTray } from 'react-icons/hi2';
import PlatformIcon from '../components/PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';
import { loadBookmarks, removeBookmark } from '../utils/bookmarks.js';
import { toastSuccess } from '../utils/swal.js';
import SectionEyebrow from '../components/SectionEyebrow.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function BookmarksView({ onQueueBookmark, onQueueAllBookmarks, onNavigate, queueingAll }) {
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks());

  const remove = (id) => {
    setBookmarks(removeBookmark(id));
    toastSuccess('Bookmark removed');
  };

  return (
    <section className="panel">
      <SectionEyebrow
        title="SAVED BOOKMARKS"
        tint="peach"
        action={(
          <div className="bookmark-header-actions">
            {bookmarks.length > 1 && (
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={queueingAll}
                onClick={() => onQueueAllBookmarks(bookmarks)}
              >
                {queueingAll ? 'Queueing…' : `Queue all (${bookmarks.length})`}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => onNavigate('new')}>
              Add from New Download
            </button>
          </div>
        )}
      />
      <div className="panel-body">
      <p className="settings-desc">
        Save URLs from the New Download page for one-click re-queuing. Stored locally in your browser.
        Use <strong>Queue all</strong> to batch-download your saved list like a personal playlist.
      </p>

      {bookmarks.length === 0 ? (
        <EmptyState
          icon={HiBookmark}
          title="No bookmarks yet"
          description='Paste a URL on New Download and click "Save bookmark".'
          actionLabel="New download"
          onAction={() => onNavigate('new')}
        />
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
      </div>
    </section>
  );
}
