import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiTrash } from 'react-icons/hi2';
import { apiFetch } from '../api/client.js';
import { formatBytes, formatDate } from '../utils/format.js';
import { confirmAction, toastError, toastSuccess } from '../utils/swal.js';
import SectionEyebrow from '../components/SectionEyebrow.jsx';

function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase() : 'FILE';
}

export default function FilesView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('modified');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/files');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const files = useMemo(() => {
    let list = [...(data?.files || [])];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return b.size - a.size;
      return new Date(b.modified) - new Date(a.modified);
    });
    return list;
  }, [data?.files, search, sort]);

  const copyPath = async (path) => {
    try {
      await navigator.clipboard.writeText(path);
      toastSuccess('Path copied');
    } catch {
      toastError('Could not copy path');
    }
  };

  const deleteFile = async (file) => {
    const ok = await confirmAction({
      title: 'Delete file?',
      text: `Remove "${file.name}" from the server permanently.`,
      confirmText: 'Delete',
      icon: 'warning',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/files/${encodeURIComponent(file.name)}`, {
      method: 'DELETE',
    });
    const body = await res.json();
    if (!res.ok) {
      toastError(body.error || 'Delete failed');
      return;
    }
    toastSuccess('File deleted');
    load();
  };

  return (
    <section className="panel panel-files">
      <SectionEyebrow
        title="FILE BROWSER"
        tint="steel"
        action={(
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      />

      <div className="panel-body">
        {data && (
          <div className="files-summary-strip">
            <span><strong>{data.count}</strong> file{data.count !== 1 ? 's' : ''}</span>
            <span><strong>{formatBytes(data.totalBytes)}</strong> total</span>
          </div>
        )}

        <div className="files-toolbar">
          <input
            type="search"
            className="history-search"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
            <option value="modified">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="size">Largest first</option>
          </select>
        </div>

        <p className="settings-desc">
          Library folder: <code>{data?.path || '…'}</code>
          {files.length !== data?.files?.length && ` · ${files.length} of ${data.files.length} shown`}
        </p>

        {loading ? (
          <p className="settings-desc">Loading files…</p>
        ) : !files.length ? (
          <p className="settings-desc">No files in the library folder yet.</p>
        ) : (
          <div className="files-table-wrap">
            <table className="files-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.path}>
                    <td><span className="file-ext-badge">{fileExt(file.name)}</span></td>
                    <td className="file-name">{file.name}</td>
                    <td>{formatBytes(file.size)}</td>
                    <td>{formatDate(file.modified)}</td>
                    <td className="file-actions-cell">
                      <button type="button" className="btn-link" onClick={() => copyPath(file.path)}>
                        Copy
                      </button>
                      <button type="button" className="btn-link btn-link-danger" onClick={() => deleteFile(file)}>
                        <HiTrash size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
