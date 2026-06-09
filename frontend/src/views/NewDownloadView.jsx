import { HiOutlineCloudArrowUp, HiBookmark, HiClock } from 'react-icons/hi2';
import PlatformIcon from '../components/PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';
import { isMediaSiteUrl, isAgeGatedSite, getDownloadEngine, needsCookiesHint } from '../utils/mediaDetect.js';
import ServerDownloadBanner from '../components/ServerDownloadBanner.jsx';

export default function NewDownloadView({
  bulkMode,
  setBulkMode,
  dragOver,
  setDragOver,
  url,
  setUrl,
  bulkText,
  setBulkText,
  category,
  setCategory,
  filename,
  setFilename,
  connections,
  setConnections,
  aiRename,
  setAiRename,
  loading,
  probing,
  suggestingName,
  error,
  probeInfo,
  appSettings,
  recentUrls = [],
  onSubmit,
  onPasteClipboard,
  onDrop,
  onSuggestName,
  onProbe,
  onQueueMedia,
  onSaveBookmark,
  onPickRecent,
}) {
  const platformName = url.trim() ? detectPlatformFromUrl(url) : null;
  const isMediaUrl = url.trim() ? isMediaSiteUrl(url) : false;
  const needsAgeCookies = url.trim() ? isAgeGatedSite(url) : false;
  const downloadEngine = url.trim() ? getDownloadEngine(url) : null;
  const cookiesHint = url.trim() ? needsCookiesHint(url) : false;
  const maxConnections = appSettings?.speed?.maxConnections
    ?? appSettings?.connections?.maxConnections
    ?? appSettings?.connections?.max
    ?? 32;

  return (
    <section className="panel">
      <div className="mode-tabs">
        <button
          type="button"
          className={`mode-tab ${!bulkMode ? 'active' : ''}`}
          onClick={() => setBulkMode(false)}
        >
          Single URL
        </button>
        <button
          type="button"
          className={`mode-tab ${bulkMode ? 'active' : ''}`}
          onClick={() => setBulkMode(true)}
        >
          Bulk URLs
        </button>
      </div>

      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <HiOutlineCloudArrowUp size={28} className="drop-zone-icon" />
        <span>Drop a link here or paste below</span>
      </div>

      <form className="download-form" onSubmit={onSubmit}>
        <ServerDownloadBanner compact />
        {!bulkMode ? (
          <>
            <label htmlFor="url">URL</label>
            <div className="url-input-wrap">
              {url.trim() && (
                <PlatformIcon
                  name={detectPlatformFromUrl(url)}
                  url={url}
                  size={20}
                  className="url-input-icon"
                />
              )}
              <input
                id="url"
                type="text"
                placeholder="YouTube, Instagram, direct .mkv link, etc."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            {platformName && (
              <p className="url-detect-hint">
                Detected: <strong>{platformName}</strong>
                {isMediaUrl && (
                  <>
                    {' '}
                    → <strong>{downloadEngine === 'yt-dlp' ? 'yt-dlp download' : 'Direct HTTP'}</strong>
                    {' '}(runs on server — safe to close tab)
                  </>
                )}
              </p>
            )}
            {cookiesHint && (
              <p className="url-detect-hint cookies-hint">
                Private content may need cookies — configure in <strong>Platform Auth</strong>.
              </p>
            )}
            {needsAgeCookies && (
              <p className="url-detect-hint age-gate-hint">
                18+ site: if download fails, set up browser cookies in <strong>Platform Auth</strong>.
              </p>
            )}
          </>
        ) : (
          <>
            <label htmlFor="bulk">URLs (one per line, up to 50)</label>
            <textarea
              id="bulk"
              placeholder={'https://example.com/file1.mkv\nhttps://example.com/file2.zip'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              required
            />
          </>
        )}

        <div className="form-toolbar">
          <button type="button" className="btn-secondary" onClick={onPasteClipboard}>
            Paste from clipboard
          </button>
          {!bulkMode && url.trim() && (
            <button type="button" className="btn-secondary" onClick={onSaveBookmark}>
              <HiBookmark size={16} />
              Save bookmark
            </button>
          )}
          {!bulkMode && appSettings?.aiRename?.configured && (
            <button
              type="button"
              className="btn-secondary"
              disabled={suggestingName || !url.trim()}
              onClick={onSuggestName}
            >
              {suggestingName ? 'Naming…' : filename ? '✨ Re-suggest name' : '✨ AI suggest name'}
            </button>
          )}
          <label
            className={`ai-toggle ${!appSettings?.aiRename?.configured ? 'disabled' : ''}`}
            title={
              appSettings?.aiRename?.configured
                ? 'AI renames files after download based on URL and title'
                : 'Set GEMINI_API_KEY in backend .env to enable'
            }
          >
            <input
              type="checkbox"
              checked={aiRename && appSettings?.aiRename?.configured}
              disabled={!appSettings?.aiRename?.configured}
              onChange={(e) => setAiRename(e.target.checked)}
            />
            <span>
              AI smart naming
              {appSettings?.aiRename?.provider === 'Google Gemini' && ' (Gemini)'}
            </span>
            {appSettings?.aiRename?.enabled && (
              <span className="ai-badge">
                {appSettings.aiRename.provider === 'Google Gemini' ? 'GEMINI' : 'ON'}
              </span>
            )}
          </label>
        </div>

        <div className="form-row">
          <div>
            <label htmlFor="category">Destination folder</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="general">General</option>
              <option value="movies">Movies</option>
              <option value="software">Software</option>
            </select>
          </div>
          {!bulkMode && (
            <div>
              <label htmlFor="filename">
                Custom filename (optional)
                {suggestingName && appSettings?.aiRename?.enabled && (
                  <span className="filename-ai-hint"> · AI naming…</span>
                )}
              </label>
              <input
                id="filename"
                type="text"
                placeholder={
                  appSettings?.aiRename?.enabled && aiRename
                    ? 'AI auto-fills when you paste a URL'
                    : 'auto-detect'
                }
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="connections-row">
          <label htmlFor="connections">
            Parallel connections (IDM-style): <strong>{connections}</strong>
          </label>
          <button
            type="button"
            className="btn-secondary btn-sm turbo-btn"
            onClick={() => setConnections(maxConnections)}
          >
            Turbo max ({maxConnections})
          </button>
        </div>
        <input
          id="connections"
          type="range"
          min="1"
          max={maxConnections}
          value={Math.min(connections, maxConnections)}
          onChange={(e) => setConnections(Number(e.target.value))}
        />
        <p className="connections-hint">
          More connections = faster on direct HTTP links when the server supports range requests.
          Media (YouTube) uses yt-dlp parallel fragments automatically.
        </p>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? 'Queueing…'
              : bulkMode
                ? 'Queue all downloads'
                : isMediaUrl
                  ? 'Download Media (yt-dlp)'
                  : 'Direct Download (HTTP)'}
          </button>
          {!bulkMode && (
            <button
              type="button"
              className="btn-secondary"
              disabled={probing || !url.trim()}
              onClick={onProbe}
            >
              {probing ? 'Fetching…' : 'Fetch Media Formats'}
            </button>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}

        {!bulkMode && recentUrls.length > 0 && (
          <div className="recent-urls">
            <p className="recent-urls-label">
              <HiClock size={16} />
              Recent URLs
            </p>
            <div className="recent-urls-list">
              {recentUrls.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  className="recent-url-chip"
                  onClick={() => onPickRecent(r)}
                  title={r.url}
                >
                  <PlatformIcon name={detectPlatformFromUrl(r.url)} size={14} />
                  <span>{r.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {probeInfo && !bulkMode && (
          <div className="media-picker">
            <div className="media-head">
              {probeInfo.thumbnail && (
                <img src={probeInfo.thumbnail} alt="" className="media-thumb" />
              )}
              <div>
                <p className="media-title">{probeInfo.title}</p>
                {probeInfo.uploader && <p className="media-sub">{probeInfo.uploader}</p>}
                {probeInfo.extractor && (
                  <span className="media-source">{probeInfo.extractor}</span>
                )}
              </div>
            </div>
            {probeInfo.videoQualities?.length > 0 && (
              <>
                <p className="media-label">Video (MP4)</p>
                <div className="media-options">
                  <button type="button" className="chip" onClick={() => onQueueMedia('best', 'video')}>
                    Best
                  </button>
                  {probeInfo.videoQualities.map((q) => (
                    <button
                      key={q.formatId}
                      type="button"
                      className="chip"
                      onClick={() => onQueueMedia(q.formatId, 'video')}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {probeInfo.audioAvailable && (
              <>
                <p className="media-label">Audio</p>
                <div className="media-options">
                  <button
                    type="button"
                    className="chip chip-audio"
                    onClick={() => onQueueMedia(null, 'audio')}
                  >
                    MP3 (best)
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
