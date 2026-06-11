import { useCallback, useEffect, useRef, useState } from 'react';
import { HiPlusCircle, HiBars3 } from 'react-icons/hi2';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Sidebar from '../components/Sidebar.jsx';
import MobileBottomNav from '../components/MobileBottomNav.jsx';
import DownloadCard from '../components/DownloadCard.jsx';
import PlatformSettings from '../components/PlatformSettings.jsx';
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
import UpdatesView from '../views/UpdatesView.jsx';
import { parseUrlLines } from '../utils/format.js';
import { initPlatformUrlRules, matchPlatformRule } from '../utils/platformDetect.js';
import { isMediaSiteUrl } from '../utils/mediaDetect.js';
import { addBookmark, loadRecentUrls } from '../utils/bookmarks.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { desktopNotify, requestNotifyPermission } from '../utils/notify.js';
import { toastSuccess, toastError, confirmAction, showHotkeys, promptCredentials } from '../utils/swal.js';
import ServerDownloadBanner from '../components/ServerDownloadBanner.jsx';
import DellFooter from '../components/DellFooter.jsx';
import './Dashboard.css';
import '../styles/dell-sidebar.css';

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
  const [historyFilter, setHistoryFilter] = useState('all');
  const [url, setUrl] = useState('');
  const category = 'general';
  const [downloads, setDownloads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeInfo, setProbeInfo] = useState(null);
  const [resolvedAsHttp, setResolvedAsHttp] = useState(false);
  const [httpMeta, setHttpMeta] = useState(null);
  const [filename, setFilename] = useState('');
  const [connections, setConnections] = useState(4);
  const [platformData, setPlatformData] = useState(null);
  const [platformSearch, setPlatformSearch] = useState('');
  const [platformCategory, setPlatformCategory] = useState('all');
  const [appSettings, setAppSettings] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [aiRename, setAiRename] = useState(false);
  const [suggestingName, setSuggestingName] = useState(false);
  const [resolvingName, setResolvingName] = useState(false);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkFormatId, setBulkFormatId] = useState('best');
  const [bulkMediaKind, setBulkMediaKind] = useState('video');
  const [bulkExpandPlaylists, setBulkExpandPlaylists] = useState(true);
  const [expandPlaylist, setExpandPlaylist] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [queueingAllBookmarks, setQueueingAllBookmarks] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const speedSamples = useRef(new Map());
  const prevStatus = useRef(new Map());
  const notifyReady = useRef(false);
  const filenameTouched = useRef(false);
  const suggestRequestId = useRef(0);
  const resolveRequestId = useRef(0);
  const probeRequestId = useRef(0);
  const bulkPreviewRequestId = useRef(0);
  const prevUrlRef = useRef('');
  const contentRef = useRef(null);

  const isValidUrl = (value) => {
    try {
      new URL(value.trim());
      return true;
    } catch {
      return false;
    }
  };

  const isLikelyMediaUrl = (value) => isMediaSiteUrl(value);

  const handleNavigate = (id, options = {}) => {
    if (id === 'history') {
      setHistoryFilter(options.filter || 'all');
    }
    setView(id);
    setMobileNavOpen(false);
  };

  useEffect(() => {
    const el = contentRef.current;
    if (el) el.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [view]);

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
    // AI rename is opt-in — server filename detection is fast and default.
    if (appSettings?.aiRename?.enabled === false) {
      setAiRename(false);
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
    setExpandPlaylist(false);
    setResolvedAsHttp(false);
    setHttpMeta(null);
  }, [url]);

  const resolveFilenameFromServer = useCallback(
    async ({ silent = false } = {}) => {
      const trimmed = url.trim();
      if (!trimmed || !isValidUrl(trimmed) || filenameTouched.current) return null;
      if (matchPlatformRule(trimmed)) return null;

      const requestId = ++resolveRequestId.current;
      setResolvingName(true);
      try {
        const res = await apiFetch('/api/downloads/resolve-filename', {
          method: 'POST',
          body: JSON.stringify({ url: trimmed }),
        });
        const data = await res.json();
        if (requestId !== resolveRequestId.current) return null;
        if (filenameTouched.current) return null;
        if (!res.ok) throw new Error(data.error || 'Could not resolve filename');

        const meta = {
          filename: data.filename || null,
          fileSize: data.fileSize ?? null,
          supportsRanges: data.supportsRanges ?? null,
          source: data.source || null,
          ready: data.type === 'http' || Boolean(data.filename),
        };
        setHttpMeta(meta);
        setResolvedAsHttp(data.type === 'http');

        if (data.filename) {
          setFilename(data.filename);
          if (!silent) {
            toastSuccess(data.source === 'server' ? 'Filename from server headers' : 'Filename from URL');
          }
        } else if (!silent && data.type === 'http') {
          toastSuccess('Server headers checked');
        }
        return meta;
      } catch (err) {
        if (requestId === resolveRequestId.current && !silent) {
          toastError(err.message);
        }
        return null;
      } finally {
        if (requestId === resolveRequestId.current) {
          setResolvingName(false);
        }
      }
    },
    [url],
  );

  const ensureHttpHeadersResolved = useCallback(
    async (trimmedUrl) => {
      if (matchPlatformRule(trimmedUrl)) return null;
      if (httpMeta?.ready && (filename.trim() || httpMeta.filename)) {
        return {
          ...httpMeta,
          filename: filename.trim() || httpMeta.filename,
        };
      }
      return resolveFilenameFromServer({ silent: true });
    },
    [httpMeta, filename, resolveFilenameFromServer],
  );

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
            use_ai: true,
          }),
        });
        const data = await res.json();
        if (requestId !== suggestRequestId.current) return;
        if (filenameTouched.current) return;
        if (!res.ok) throw new Error(data.error || 'Could not suggest filename');
        setFilename(data.filename);
        if (!silent) {
          toastSuccess(
            data.aiUsed ? 'AI suggested a filename' : 'Instant local filename (no API wait)',
          );
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
    if (filenameTouched.current) return;

    const trimmed = url.trim();
    if (!trimmed || !isValidUrl(trimmed)) return;

    const timer = setTimeout(() => {
      // Skip only for known media platforms — unknown domains may serve direct files
      if (matchPlatformRule(trimmed)) return;
      resolveFilenameFromServer({ silent: true });
    }, 80);

    return () => clearTimeout(timer);
  }, [url, bulkMode, view, resolveFilenameFromServer]);

  const runProbe = useCallback(
    async ({ silent = false } = {}) => {
      const trimmed = url.trim();
      if (!trimmed || !isValidUrl(trimmed) || !isLikelyMediaUrl(trimmed)) return;

      const requestId = ++probeRequestId.current;
      setProbing(true);
      if (!silent) setError('');
      try {
        const res = await apiFetch('/api/downloads/probe', {
          method: 'POST',
          body: JSON.stringify({ url: trimmed }),
        });
        const data = await res.json();
        if (requestId !== probeRequestId.current) return;
        if (!res.ok) throw new Error(data.error || 'Could not read media info');
        setProbeInfo(data);
        if (!silent) toastSuccess('Formats loaded');
      } catch (err) {
        if (requestId === probeRequestId.current) {
          if (!silent) {
            setError(err.message);
            toastError(err.message);
          }
        }
      } finally {
        if (requestId === probeRequestId.current) {
          setProbing(false);
        }
      }
    },
    [url],
  );

  const loadPlaylistCount = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed || !probeInfo?.playlist?.pending) return;

    setPlaylistLoading(true);
    try {
      const res = await apiFetch('/api/downloads/playlist', {
        method: 'POST',
        body: JSON.stringify({ url: trimmed }),
      });
      const playlist = await res.json();
      if (!res.ok) throw new Error(playlist.error || 'Could not load playlist');
      setProbeInfo((prev) => (prev ? { ...prev, playlist } : prev));
    } catch (err) {
      toastError(err.message);
    } finally {
      setPlaylistLoading(false);
    }
  }, [url, probeInfo?.playlist?.pending]);

  useEffect(() => {
    if (!expandPlaylist || !probeInfo?.playlist?.pending) return;
    loadPlaylistCount();
  }, [expandPlaylist, probeInfo?.playlist?.pending, loadPlaylistCount]);

  const shouldExpandPlaylist = (playlist) => {
    if (!expandPlaylist || !playlist) return false;
    if (playlist.entryCount > 1) return true;
    return Boolean(playlist.pending);
  };

  useEffect(() => {
    if (bulkMode || view !== 'new') return;

    const trimmed = url.trim();
    if (!trimmed || !isValidUrl(trimmed)) return;
    // Only auto-probe known media platforms — not ambiguous hash/token URLs
    if (!matchPlatformRule(trimmed)) return;

    const timer = setTimeout(() => {
      runProbe({ silent: true });
    }, 350);

    return () => clearTimeout(timer);
  }, [url, bulkMode, view, runProbe]);

  useEffect(() => {
    if (!bulkMode || view !== 'new') {
      setBulkPreview(null);
      return undefined;
    }

    const urls = parseUrlLines(bulkText);
    if (!urls.length) {
      setBulkPreview(null);
      return undefined;
    }

    const requestId = ++bulkPreviewRequestId.current;
    const timer = setTimeout(async () => {
      setBulkPreviewLoading(true);
      try {
        const res = await apiFetch('/api/downloads/bulk/preview', {
          method: 'POST',
          body: JSON.stringify({ urls, expand_playlists: bulkExpandPlaylists }),
        });
        const data = await res.json();
        if (requestId !== bulkPreviewRequestId.current) return;
        if (res.ok) setBulkPreview(data);
        else setBulkPreview(null);
      } catch {
        if (requestId === bulkPreviewRequestId.current) setBulkPreview(null);
      } finally {
        if (requestId === bulkPreviewRequestId.current) setBulkPreviewLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [bulkText, bulkMode, view, bulkExpandPlaylists]);

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
          body: JSON.stringify({
            urls,
            category,
            connections: Number(connections) || 4,
            ai_rename: aiRename,
            format_id: bulkMediaKind === 'audio' ? null : bulkFormatId,
            media_kind: bulkMediaKind,
            expand_playlists: bulkExpandPlaylists,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Bulk queue failed');
        setBulkText('');
        setBulkPreview(null);
        toastSuccess(
          data.expanded
            ? `${data.count} download(s) queued (playlists expanded) — safe to close this tab`
            : `${data.count} download(s) queued on server — safe to close this tab`,
        );
        setView('active');
        await refresh();
        return;
      }

      const trimmedUrl = url.trim();
      const useMedia = resolvedAsHttp ? false : isMediaSiteUrl(trimmedUrl);

      let queueFilename = filename.trim() || null;
      let queueFileSize = null;
      if (!useMedia) {
        const meta =
          httpMeta?.ready && (filename.trim() || httpMeta.filename)
            ? { ...httpMeta, filename: filename.trim() || httpMeta.filename }
            : await ensureHttpHeadersResolved(trimmedUrl);
        if (!meta?.filename && !queueFilename) {
          throw new Error('Could not read filename from server headers — try Refresh filename');
        }
        queueFilename = queueFilename || meta?.filename || null;
        queueFileSize = meta?.fileSize ?? null;
      }

      const res = await apiFetch('/api/downloads', {
        method: 'POST',
        body: JSON.stringify({
          url: trimmedUrl,
          category,
          type: useMedia ? 'media' : 'http',
          format_id: useMedia ? 'best' : undefined,
          media_kind: useMedia ? 'video' : undefined,
          connections: useMedia ? undefined : Number(connections) || 4,
          filename: useMedia ? null : queueFilename,
          file_size: !useMedia ? queueFileSize ?? undefined : undefined,
          ai_rename: aiRename && !queueFilename,
          expand_playlist: useMedia && shouldExpandPlaylist(probeInfo?.playlist),
          title: useMedia ? probeInfo?.title || null : undefined,
          thumbnail: useMedia ? probeInfo?.thumbnail || null : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to queue download');
      setUrl('');
      setFilename('');
      setProbeInfo(null);
      setHttpMeta(null);
      setResolvedAsHttp(false);
      toastSuccess(
        data.playlist
          ? `${data.count} videos from playlist queued — safe to close this tab`
          : 'Queued on server — safe to close this tab or shut your laptop',
      );
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

  const handleResolveFilename = () => resolveFilenameFromServer({ silent: false });

  const handleFilenameChange = (value) => {
    filenameTouched.current = true;
    setFilename(value);
  };

  const handleProbe = async () => {
    setProbeInfo(null);
    await runProbe({ silent: false });
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
          expand_playlist: shouldExpandPlaylist(probeInfo?.playlist),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to queue download');
      setUrl('');
      setProbeInfo(null);
      toastSuccess(
        data.playlist
          ? `${data.count} videos from playlist queued — safe to close this tab`
          : 'Queued on server — safe to close this tab',
      );
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
    toastSuccess('Resuming on server — safe to close this tab');
    setView('active');
    refresh();
  };

  const handleRetry = async (id, { fresh = false } = {}) => {
    const suffix = fresh ? '?fresh=1' : '';
    await apiFetch(`/api/downloads/${id}/retry${suffix}`, { method: 'POST' });
    toastSuccess(fresh ? 'Download restarted from scratch' : 'Download re-queued on server');
    setView('active');
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
    setProbeInfo(null);
  };

  const handleQueueBookmark = async (bookmark) => {
    setLoading(true);
    try {
      const trimmed = bookmark.url?.trim();
      const useMedia = isMediaSiteUrl(trimmed);
      const res = await apiFetch('/api/downloads', {
        method: 'POST',
        body: JSON.stringify({
          url: trimmed,
          category: bookmark.category || 'general',
          type: useMedia ? 'media' : 'http',
          format_id: useMedia ? 'best' : undefined,
          media_kind: useMedia ? 'video' : undefined,
          connections: useMedia ? undefined : Number(connections) || 4,
          ai_rename: aiRename,
          expand_playlist: useMedia && bulkExpandPlaylists,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to queue');
      toastSuccess(
        data.playlist
          ? `${data.count} videos from playlist queued`
          : 'Queued on server — safe to close this tab',
      );
      setView('active');
      refresh();
    } catch (err) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQueueAllBookmarks = async (bookmarks) => {
    const urls = bookmarks.map((b) => b.url?.trim()).filter(Boolean);
    if (!urls.length) return;
    setQueueingAllBookmarks(true);
    try {
      const res = await apiFetch('/api/downloads/bulk', {
        method: 'POST',
        body: JSON.stringify({
          urls,
          category: bookmarks[0]?.category || 'general',
          connections: Number(connections) || 4,
          ai_rename: aiRename,
          format_id: bulkMediaKind === 'audio' ? null : bulkFormatId,
          media_kind: bulkMediaKind,
          expand_playlists: bulkExpandPlaylists,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk queue failed');
      toastSuccess(`${data.count} bookmark(s) queued on server`);
      setView('active');
      refresh();
    } catch (err) {
      toastError(err.message);
    } finally {
      setQueueingAllBookmarks(false);
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
        <div className="dell-top-banner" role="banner">
          <div className="dell-top-banner-copy">
            <strong>REMOTE DOWNLOADS. ONLINE.</strong>
            <span>Queue files on your home server — safe to close this tab or shut down your PC.</span>
          </div>
          <span className="dell-buy-sticker">QUEUE a FILE</span>
        </div>
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
            <div className="live-badge">
              <span className="live-dot" />
              <span className="live-badge-text">Live</span>
            </div>
          </div>
        </header>

        <div className="dashboard-content" key={view} ref={contentRef}>
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
              filename={filename}
              setFilename={handleFilenameChange}
              connections={connections}
              setConnections={setConnections}
              aiRename={aiRename}
              setAiRename={setAiRename}
              loading={loading}
              probing={probing}
              suggestingName={suggestingName}
              resolvingName={resolvingName}
              bulkPreview={bulkPreview}
              bulkPreviewLoading={bulkPreviewLoading}
              bulkFormatId={bulkFormatId}
              setBulkFormatId={setBulkFormatId}
              bulkMediaKind={bulkMediaKind}
              setBulkMediaKind={setBulkMediaKind}
              bulkExpandPlaylists={bulkExpandPlaylists}
              setBulkExpandPlaylists={setBulkExpandPlaylists}
              expandPlaylist={expandPlaylist}
              setExpandPlaylist={setExpandPlaylist}
              playlistLoading={playlistLoading}
              resolvedAsHttp={resolvedAsHttp}
              httpFileSize={httpMeta?.fileSize ?? null}
              error={error}
              probeInfo={probeInfo}
              appSettings={appSettings}
              recentUrls={recentUrls}
              onSubmit={handleSubmit}
              onPasteClipboard={handlePasteClipboard}
              onDrop={handleDrop}
              onSuggestName={handleSuggestName}
              onResolveFilename={handleResolveFilename}
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
              initialFilter={historyFilter}
              onClearHistory={handleClearHistory}
              onRetryFailed={handleRetryFailed}
              renderDownloadItem={renderDownloadItem}
            />
          )}

          {view === 'bookmarks' && (
            <BookmarksView
              onQueueBookmark={handleQueueBookmark}
              onQueueAllBookmarks={handleQueueAllBookmarks}
              onNavigate={handleNavigate}
              queueingAll={queueingAllBookmarks}
            />
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

          {view === 'updates' && <UpdatesView />}

          {view === 'security' && <SecurityView />}

          {view === 'help' && (
            <HelpView appSettings={appSettings} onNavigate={handleNavigate} />
          )}

          <DellFooter onNavigate={handleNavigate} />
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
