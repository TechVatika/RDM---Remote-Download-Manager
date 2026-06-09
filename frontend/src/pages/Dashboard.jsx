import { useCallback, useEffect, useRef, useState } from 'react';
import { HiPlusCircle, HiBars3 } from 'react-icons/hi2';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Sidebar from '../components/Sidebar.jsx';
import MobileBottomNav from '../components/MobileBottomNav.jsx';
import DownloadCard from '../components/DownloadCard.jsx';
import PlatformSettings from '../components/PlatformSettings.jsx';
import BackgroundDecor from '../components/BackgroundDecor.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import GlobalSearch from '../components/GlobalSearch.jsx';
import { getNavLabel, getNavSubtitle } from '../config/nav.js';
import OverviewView from '../views/OverviewView.jsx';
import NewDownloadView from '../views/NewDownloadView.jsx';
import ActiveView from '../views/ActiveView.jsx';
import HistoryView from '../views/HistoryView.jsx';
import AnalyticsView from '../views/AnalyticsView.jsx';
import PlatformsView from '../views/PlatformsView.jsx';
import AppSettingsView from '../views/AppSettingsView.jsx';
import SystemHealthView from '../views/SystemHealthView.jsx';
import LogsView from '../views/LogsView.jsx';
import SecurityView from '../views/SecurityView.jsx';
import BookmarksView from '../views/BookmarksView.jsx';
import ActivityView from '../views/ActivityView.jsx';
import HelpView from '../views/HelpView.jsx';
import UserAccountView from '../views/UserAccountView.jsx';
import { parseUrlLines } from '../utils/format.js';
import { initPlatformUrlRules } from '../utils/platformDetect.js';
import { isMediaSiteUrl } from '../utils/mediaDetect.js';
import { addBookmark, loadRecentUrls } from '../utils/bookmarks.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { desktopNotify, requestNotifyPermission } from '../utils/notify.js';
import { toastSuccess, toastError, confirmAction, showHotkeys, promptCredentials } from '../utils/swal.js';
import ServerDownloadBanner from '../components/ServerDownloadBanner.jsx';
import './Dashboard.css';

export default function Dashboard() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    const ok = await confirmAction({
      title: 'Sign out?',
      text: 'You will need to sign in again to access RDM.',
      confirmText: 'Sign out',
      icon: 'question',
    });
    if (ok) logout();
  };

  const [view, setView] = useState('overview');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('movies');
  const [downloads, setDownloads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeInfo, setProbeInfo] = useState(null);
  const [filename, setFilename] = useState('');
  const [connections, setConnections] = useState(16);
  const [platformData, setPlatformData] = useState(null);
  const [platformSearch, setPlatformSearch] = useState('');
  const [platformCategory, setPlatformCategory] = useState('all');
  const [appSettings, setAppSettings] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [aiRename, setAiRename] = useState(true);
  const [suggestingName, setSuggestingName] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const speedSamples = useRef(new Map());
  const prevStatus = useRef(new Map());
  const notifyReady = useRef(false);
  const filenameTouched = useRef(false);
  const suggestRequestId = useRef(0);
  const prevUrlRef = useRef('');

  const isValidUrl = (value) => {
    try {
      new URL(value.trim());
      return true;
    } catch {
      return false;
    }
  };

  const isLikelyMediaUrl = (value) => isMediaSiteUrl(value);

  const handleNavigate = (id) => {
    setView(id);
    setMobileNavOpen(false);
  };

  const loadPlatforms = useCallback(async () => {
    const res = await apiFetch('/api/platforms');
    if (res.ok) {
      const data = await res.json();
      if (data.urlRules) initPlatformUrlRules(data.urlRules);
      setPlatformData(data);
    }
  }, []);

  const loadAppSettings = useCallback(async () => {
    const res = await apiFetch('/api/settings');
    if (res.ok) setAppSettings(await res.json());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [dlRes, stRes] = await Promise.all([
        apiFetch('/api/downloads'),
        apiFetch('/api/stats'),
      ]);
      if (!dlRes.ok) throw new Error('Failed to load downloads');
      const data = await dlRes.json();
      if (stRes.ok) setStats(await stRes.json());

      const now = Date.now();
      for (const item of data) {
        if (item.status !== 'downloading') continue;
        const prev = speedSamples.current.get(item.id);
        const bytes = Number(item.bytes_downloaded) || 0;
        if (prev && bytes > prev.bytes) {
          const dt = (now - prev.at) / 1000;
          if (dt > 0) {
            speedSamples.current.set(item.id, {
              bytes,
              at: now,
              bps: (bytes - prev.bytes) / dt,
            });
            continue;
          }
        }
        if (!prev) speedSamples.current.set(item.id, { bytes, at: now, bps: 0 });
      }
      setDownloads(data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const getSpeed = (item) => speedSamples.current.get(item.id)?.bps || 0;

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    refresh();
    loadPlatforms();
    loadAppSettings();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh, loadPlatforms, loadAppSettings]);

  useEffect(() => {
    let cancelled = false;
    const loadSystem = async () => {
      const res = await apiFetch('/api/system');
      if (res.ok && !cancelled) setSystemInfo(await res.json());
    };
    loadSystem();
    const timer = setInterval(loadSystem, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Global keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const NAV_KEYS = {
      o: 'overview',
      n: 'new',
      a: 'active',
      h: 'history',
      b: 'bookmarks',
      p: 'platforms',
    };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target;
      if (
        el?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) ||
        document.querySelector('.swal2-container')
      ) {
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        showHotkeys([
          [['O'], 'Overview'],
          [['N'], 'New download'],
          [['A'], 'Active queue'],
          [['H'], 'History'],
      [['F'], 'Files'],
      [['B'], 'Bookmarks'],
      [['P'], 'Platforms'],
      [['?'], 'This help'],
        ]);
        return;
      }
      const key = e.key.toLowerCase();
      if (NAV_KEYS[key]) {
        e.preventDefault();
        handleNavigate(NAV_KEYS[key]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Notify when downloads finish (in-app toast + desktop notification).
  useEffect(() => {
    const prev = prevStatus.current;
    if (notifyReady.current) {
      for (const d of downloads) {
        const before = prev.get(d.id);
        if (!before) continue;
        const label = d.title || d.url || `Download #${d.id}`;
        if (before !== 'completed' && d.status === 'completed') {
          toastSuccess(`Finished: ${label}`);
          desktopNotify('Download complete', label);
        } else if (before !== 'failed' && d.status === 'failed') {
          toastError(`Failed: ${label}`);
          desktopNotify('Download failed', label);
        }
      }
    }
    const next = new Map();
    for (const d of downloads) next.set(d.id, d.status);
    prevStatus.current = next;
    notifyReady.current = true;
  }, [downloads]);

  useEffect(() => {
    if (appSettings?.aiRename) {
      setAiRename(appSettings.aiRename.enabled);
    }
  }, [appSettings?.aiRename?.enabled]);

  useEffect(() => {
    const speed = appSettings?.speed || appSettings?.connections;
    if (speed?.defaultConnections) {
      setConnections(speed.defaultConnections);
    } else if (speed?.default) {
      setConnections(speed.default);
    }
  }, [appSettings?.speed, appSettings?.connections]);

  useEffect(() => {
    const trimmed = url.trim();
    if (trimmed === prevUrlRef.current) return;
    prevUrlRef.current = trimmed;
    filenameTouched.current = false;
    setFilename('');
    setProbeInfo(null);
  }, [url]);

  const suggestFilenameForUrl = useCallback(
    async ({ silent = false } = {}) => {
      const trimmed = url.trim();
      if (!trimmed || !isValidUrl(trimmed) || filenameTouched.current) return;

      const requestId = ++suggestRequestId.current;
      setSuggestingName(true);
      try {
        const isMedia = Boolean(probeInfo) || isLikelyMediaUrl(trimmed);
        const res = await apiFetch('/api/downloads/suggest-name', {
          method: 'POST',
          body: JSON.stringify({
            url: trimmed,
            category,
            type: isMedia ? 'media' : 'http',
            title: probeInfo?.title || null,
          }),
        });
        const data = await res.json();
        if (requestId !== suggestRequestId.current) return;
        if (filenameTouched.current) return;
        if (!res.ok) throw new Error(data.error || 'Could not suggest filename');
        setFilename(data.filename);
        if (!silent) {
          toastSuccess(data.aiUsed ? 'AI suggested a filename' : 'Suggested filename');
        }
      } catch (err) {
        if (requestId === suggestRequestId.current && !silent) {
          toastError(err.message);
        }
      } finally {
        if (requestId === suggestRequestId.current) {
          setSuggestingName(false);
        }
      }
    },
    [url, category, probeInfo],
  );

  useEffect(() => {
    if (bulkMode || view !== 'new') return;
    if (!aiRename || !appSettings?.aiRename?.enabled) return;
    if (filenameTouched.current) return;

    const trimmed = url.trim();
    if (!trimmed || !isValidUrl(trimmed)) return;

    const timer = setTimeout(() => {
      suggestFilenameForUrl({ silent: true });
    }, 650);

    return () => clearTimeout(timer);
  }, [
    url,
    category,
    probeInfo?.title,
    aiRename,
    appSettings?.aiRename?.enabled,
    bulkMode,
    view,
    suggestFilenameForUrl,
  ]);

  useEffect(() => {
    if ((view === 'help' || view === 'platforms' || view === 'app-settings') && !platformData) {
      loadPlatforms();
    }
    if ((view === 'help' || view === 'app-settings') && !appSettings) {
      loadAppSettings();
    }
  }, [view, loadPlatforms, loadAppSettings, platformData, appSettings]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    requestNotifyPermission();
    try {
      if (bulkMode) {
        const urls = parseUrlLines(bulkText);
        if (!urls.length) throw new Error('Add at least one URL (one per line)');
        const res = await apiFetch('/api/downloads/bulk', {
          method: 'POST',
          body: JSON.stringify({ urls, category, connections: Number(connections) || 16, ai_rename: aiRename }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Bulk queue failed');
        setBulkText('');
        toastSuccess(`${data.count} download(s) queued on server — safe to close this tab`);
        setView('active');
        await refresh();
        return;
      }

      const trimmedUrl = url.trim();
      const useMedia = isMediaSiteUrl(trimmedUrl);

      const res = await apiFetch('/api/downloads', {
        method: 'POST',
        body: JSON.stringify({
          url: trimmedUrl,
          category,
          type: useMedia ? 'media' : 'http',
          format_id: useMedia ? 'best' : undefined,
          media_kind: useMedia ? 'video' : undefined,
          connections: useMedia ? undefined : Number(connections) || 16,
          filename: useMedia ? null : filename.trim() || null,
          ai_rename: aiRename && !filename.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to queue download');
      setUrl('');
      setFilename('');
      toastSuccess('Queued on server — safe to close this tab or shut your laptop');
      setView('active');
      await refresh();
    } catch (err) {
      setError(err.message);
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (bulkMode) setBulkText((prev) => (prev ? `${prev}\n${text}` : text));
      else setUrl(text.trim());
      toastSuccess('Pasted from clipboard');
    } catch {
      toastError('Could not read clipboard');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const text = e.dataTransfer.getData('text');
    if (!text) return;
    if (bulkMode) setBulkText((prev) => (prev ? `${prev}\n${text}` : text));
    else setUrl(text.trim());
  };

  const handleSuggestName = () => suggestFilenameForUrl({ silent: false });

  const handleFilenameChange = (value) => {
    filenameTouched.current = true;
    setFilename(value);
  };

  const handleProbe = async () => {
    setProbing(true);
    setError('');
    setProbeInfo(null);
    try {
      const res = await apiFetch('/api/downloads/probe', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read media info');
      setProbeInfo(data);
      toastSuccess('Formats loaded');
    } catch (err) {
      setError(err.message);
      toastError(err.message);
    } finally {
      setProbing(false);
    }
  };

  const queueMedia = async (formatId, mediaKind) => {
    setError('');
    requestNotifyPermission();
    try {
      const res = await apiFetch('/api/downloads', {
        method: 'POST',
        body: JSON.stringify({
          url: url.trim(),
          category,
          type: 'media',
          format_id: formatId,
          media_kind: mediaKind,
          title: probeInfo?.title || null,
          thumbnail: probeInfo?.thumbnail || null,
          ai_rename: aiRename,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to queue download');
      setUrl('');
      setProbeInfo(null);
      toastSuccess('Queued on server — safe to close this tab');
      setView('active');
      await refresh();
    } catch (err) {
      setError(err.message);
      toastError(err.message);
    }
  };

  const handleCancel = async (id) => {
    const ok = await confirmAction({
      title: 'Cancel download?',
      text: 'This will stop the download and discard progress.',
      confirmText: 'Cancel download',
      icon: 'warning',
    });
    if (!ok) return;
    await apiFetch(`/api/downloads/${id}/cancel`, { method: 'POST' });
    toastSuccess('Download cancelled');
    refresh();
  };

  const handlePause = async (id) => {
    await apiFetch(`/api/downloads/${id}/pause`, { method: 'POST' });
    toastSuccess('Download paused');
    refresh();
  };

  const handleResume = async (id) => {
    await apiFetch(`/api/downloads/${id}/resume`, { method: 'POST' });
    toastSuccess('Download resumed');
    refresh();
  };

  const handleRetry = async (id) => {
    await apiFetch(`/api/downloads/${id}/retry`, { method: 'POST' });
    toastSuccess('Download re-queued');
    refresh();
  };

  const handleProvideCredentials = async (item) => {
    const creds = await promptCredentials({
      text: item?.title
        ? `“${item.title}” needs a login. Enter the username and password for this link.`
        : undefined,
    });
    if (!creds) return;
    try {
      const res = await apiFetch(`/api/downloads/${item.id}/credentials`, {
        method: 'POST',
        body: JSON.stringify(creds),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not submit credentials');
      }
      toastSuccess('Credentials saved — retrying download');
      setView('active');
      refresh();
    } catch (err) {
      toastError(err.message);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirmAction({
      title: 'Remove from list?',
      text: 'This deletes the record from history.',
      confirmText: 'Remove',
      icon: 'warning',
    });
    if (!ok) return;
    await apiFetch(`/api/downloads/${id}`, { method: 'DELETE' });
    toastSuccess('Removed');
    refresh();
  };

  const handleCopyPath = async (filePath) => {
    if (await copyToClipboard(filePath)) toastSuccess('Path copied');
    else toastError('Could not copy path');
  };

  const handleCopyUrl = async (link) => {
    if (await copyToClipboard(link)) toastSuccess('URL copied');
    else toastError('Could not copy URL');
  };

  const handleClearHistory = async () => {
    const ok = await confirmAction({
      title: 'Clear completed & cancelled?',
      text: 'This removes finished downloads from the list.',
      confirmText: 'Clear',
      icon: 'question',
    });
    if (!ok) return;
    const res = await apiFetch('/api/downloads/clear-completed', { method: 'POST' });
    const data = await res.json();
    toastSuccess(`Cleared ${data.deleted} item(s)`);
    refresh();
  };

  const handlePauseAll = async () => {
    const ok = await confirmAction({
      title: 'Pause all active downloads?',
      confirmText: 'Pause all',
      icon: 'question',
    });
    if (!ok) return;
    const res = await apiFetch('/api/downloads/bulk/pause-all', { method: 'POST' });
    const data = await res.json();
    toastSuccess(`Paused ${data.paused} download(s)`);
    refresh();
  };

  const handleCancelAll = async () => {
    const ok = await confirmAction({
      title: 'Cancel all active downloads?',
      text: 'Progress will be lost for all queued and running jobs.',
      confirmText: 'Cancel all',
      icon: 'warning',
    });
    if (!ok) return;
    const res = await apiFetch('/api/downloads/bulk/cancel-all', { method: 'POST' });
    const data = await res.json();
    toastSuccess(`Cancelled ${data.cancelled} download(s)`);
    refresh();
  };

  const handleRetryFailed = async () => {
    const res = await apiFetch('/api/downloads/bulk/retry-failed', { method: 'POST' });
    const data = await res.json();
    toastSuccess(`Re-queued ${data.retried} failed download(s)`);
    setView('active');
    refresh();
  };

  const handleSaveBookmark = () => {
    if (!url.trim()) return;
    addBookmark({ url: url.trim(), label: probeInfo?.title || url.trim(), category });
    toastSuccess('Bookmark saved');
  };

  const handlePickRecent = (r) => {
    setUrl(r.url);
    setCategory(r.category || 'general');
    setProbeInfo(null);
  };

  const handleQueueBookmark = async (bookmark) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/downloads', {
        method: 'POST',
        body: JSON.stringify({
          url: bookmark.url,
          category: bookmark.category || 'general',
          type: 'http',
          connections: Number(connections) || 16,
          ai_rename: aiRename,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to queue');
      toastSuccess('Queued on server — safe to close this tab');
      setView('active');
      refresh();
    } catch (err) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const active = downloads.filter((d) =>
    ['queued', 'downloading', 'paused'].includes(d.status),
  );
  const history = downloads.filter((d) =>
    ['completed', 'failed', 'cancelled'].includes(d.status),
  );
  const failedCount = downloads.filter((d) => d.status === 'failed').length;
  const summary = stats?.summary;
  const platformTotal = platformData?.totalListed ?? 0;
  const categories = platformData?.categories ?? [];
  const filteredCategories = categories
    .filter((cat) => platformCategory === 'all' || cat.id === platformCategory)
    .map((cat) => ({
      ...cat,
      platforms: cat.platforms.filter(
        (p) =>
          !platformSearch.trim() ||
          p.name.toLowerCase().includes(platformSearch.toLowerCase()) ||
          p.note.toLowerCase().includes(platformSearch.toLowerCase()),
      ),
    }))
    .filter((cat) => cat.platforms.length > 0);

  const totalSpeed = active.reduce((sum, item) => sum + getSpeed(item), 0);
  const recentUrls = loadRecentUrls(downloads);
  const systemStatus = systemInfo
    ? {
        ok: systemInfo.status === 'ok',
        label: systemInfo.status === 'ok' ? 'Healthy' : 'Degraded',
        ytdlp: systemInfo.engines?.ytdlp?.version?.split('\n')[0]?.slice(0, 12),
      }
    : null;

  const renderDownloadItem = (item, showActions = true) => (
    <DownloadCard
      key={item.id}
      item={item}
      showActions={showActions}
      speed={getSpeed(item)}
      onPause={handlePause}
      onResume={handleResume}
      onCancel={handleCancel}
      onRetry={handleRetry}
      onDelete={handleDelete}
      onCopyPath={handleCopyPath}
      onCopyUrl={handleCopyUrl}
      onProvideCredentials={handleProvideCredentials}
    />
  );

  return (
    <div className="dashboard">
      <Sidebar
        view={view}
        setView={handleNavigate}
        user={user}
        activeCount={active.length}
        failedCount={failedCount}
        onLogout={handleLogout}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="dashboard-main">
        <BackgroundDecor />
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <HiBars3 size={22} />
            </button>
            <div className="topbar-titles">
              <h1>{getNavLabel(view)}</h1>
              <p className="topbar-subtitle">{getNavSubtitle(view)}</p>
            </div>
            <GlobalSearch downloads={downloads} onNavigate={handleNavigate} />
          </div>
          <div className="topbar-actions">
            {view !== 'new' && (
              <button type="button" className="btn-primary topbar-cta" onClick={() => handleNavigate('new')}>
                <HiPlusCircle size={18} />
                <span className="topbar-cta-text">New download</span>
              </button>
            )}
            <ThemeToggle />
            <div className="live-badge">
              <span className="live-dot" />
              <span className="live-badge-text">Live</span>
            </div>
          </div>
        </header>

        <div className="dashboard-content" key={view}>
          {view === 'overview' && (
            <OverviewView
              user={user}
              summary={summary}
              active={active}
              history={history}
              platformTotal={platformTotal}
              totalSpeed={totalSpeed}
              systemStatus={systemStatus}
              onNavigate={handleNavigate}
              renderDownloadItem={renderDownloadItem}
            />
          )}

          {view === 'new' && (
            <NewDownloadView
              bulkMode={bulkMode}
              setBulkMode={setBulkMode}
              dragOver={dragOver}
              setDragOver={setDragOver}
              url={url}
              setUrl={setUrl}
              bulkText={bulkText}
              setBulkText={setBulkText}
              category={category}
              setCategory={setCategory}
              filename={filename}
              setFilename={handleFilenameChange}
              connections={connections}
              setConnections={setConnections}
              aiRename={aiRename}
              setAiRename={setAiRename}
              loading={loading}
              probing={probing}
              suggestingName={suggestingName}
              error={error}
              probeInfo={probeInfo}
              appSettings={appSettings}
              recentUrls={recentUrls}
              onSubmit={handleSubmit}
              onPasteClipboard={handlePasteClipboard}
              onDrop={handleDrop}
              onSuggestName={handleSuggestName}
              onProbe={handleProbe}
              onQueueMedia={queueMedia}
              onSaveBookmark={handleSaveBookmark}
              onPickRecent={handlePickRecent}
            />
          )}

          {view === 'active' && (
            <ActiveView
              active={active}
              onNavigate={handleNavigate}
              renderDownloadItem={renderDownloadItem}
              onPauseAll={handlePauseAll}
              onCancelAll={handleCancelAll}
            />
          )}

          {view === 'history' && (
            <HistoryView
              history={history}
              onClearHistory={handleClearHistory}
              onRetryFailed={handleRetryFailed}
              renderDownloadItem={renderDownloadItem}
            />
          )}

          {view === 'bookmarks' && (
            <BookmarksView onQueueBookmark={handleQueueBookmark} onNavigate={handleNavigate} />
          )}

          {view === 'activity' && (
            <ActivityView downloads={downloads} onNavigate={handleNavigate} />
          )}

          {view === 'analytics' && <AnalyticsView />}

          {view === 'platforms' && (
            <PlatformsView
              platformData={platformData}
              platformTotal={platformTotal}
              platformCategory={platformCategory}
              setPlatformCategory={setPlatformCategory}
              platformSearch={platformSearch}
              setPlatformSearch={setPlatformSearch}
              filteredCategories={filteredCategories}
              categories={categories}
              onNavigate={handleNavigate}
            />
          )}

          {view === 'platform-settings' && <PlatformSettings />}

          {view === 'account' && <UserAccountView />}

          {view === 'app-settings' && (
            <AppSettingsView appSettings={appSettings} onNavigate={handleNavigate} />
          )}

          {view === 'system' && <SystemHealthView />}

          {view === 'logs' && <LogsView />}

          {view === 'security' && <SecurityView />}

          {view === 'help' && (
            <HelpView appSettings={appSettings} onNavigate={handleNavigate} />
          )}
        </div>

        <MobileBottomNav
          view={view}
          onSelect={handleNavigate}
          activeCount={active.length}
          onOpenMenu={() => setMobileNavOpen(true)}
        />
      </div>
    </div>
  );
}
