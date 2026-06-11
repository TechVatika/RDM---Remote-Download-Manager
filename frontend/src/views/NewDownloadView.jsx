import { HiOutlineCloudArrowUp, HiBookmark, HiClock, HiCog6Tooth } from 'react-icons/hi2';
import PlatformIcon from '../components/PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';
import { isMediaSiteUrl, isAgeGatedSite, getDownloadEngine, needsCookiesHint } from '../utils/mediaDetect.js';
import { formatBytes, parseUrlLines } from '../utils/format.js';
import ServerDownloadBanner from '../components/ServerDownloadBanner.jsx';
import SectionEyebrow from '../components/SectionEyebrow.jsx';
import MediaFormatPicker, { BulkMediaFormatPicker } from '../components/MediaFormatPicker.jsx';

function SectionDivider({ label }) {
  return (
    <div className="new-download-divider" role="separator" aria-label={label || undefined}>
      {label ? <span className="new-download-divider-label">{label}</span> : null}
    </div>
  );
}

export default function NewDownloadView({
  bulkMode,
  setBulkMode,
  dragOver,
  setDragOver,
  url,
  setUrl,
  bulkText,
  setBulkText,
  filename,
  setFilename,
  connections,
  setConnections,
  aiRename,
  setAiRename,
  loading,
  probing,
  suggestingName,
  resolvingName,
  bulkPreview,
  bulkPreviewLoading,
  bulkFormatId,
  setBulkFormatId,
  bulkMediaKind,
  setBulkMediaKind,
  bulkExpandPlaylists,
  setBulkExpandPlaylists,
  expandPlaylist,
  setExpandPlaylist,
  error,
  probeInfo,
  appSettings,
  recentUrls = [],
  onSubmit,
  onPasteClipboard,
  onDrop,
  onSuggestName,
  onResolveFilename,
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
    ?? 16;
  const showConnections = bulkMode || !isMediaUrl;

  const bulkLineCount = bulkMode ? parseUrlLines(bulkText).length : 0;
  const bulkExpandedCount = bulkPreview?.expandedCount ?? bulkLineCount;

  const selectBulkFormat = (formatId, mediaKind) => {
    setBulkFormatId(formatId);
    setBulkMediaKind(mediaKind);
  };

  return (
    <section className="panel panel-new-download">
      <SectionEyebrow title="QUEUE A NEW DOWNLOAD" tint="peach" />
      <div className="panel-body new-download-body">
        <div className="mode-tabs new-download-tabs" role="tablist" aria-label="Download mode">
          <button
            type="button"
            role="tab"
            aria-selected={!bulkMode}
            className={`mode-tab ${!bulkMode ? 'active' : ''}`}
            onClick={() => setBulkMode(false)}
          >
            Single URL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={bulkMode}
            className={`mode-tab ${bulkMode ? 'active' : ''}`}
            onClick={() => setBulkMode(true)}
          >
            Bulk URLs
          </button>
        </div>

        <div
          className={`drop-zone new-download-drop ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <HiOutlineCloudArrowUp size={32} className="drop-zone-icon" />
          <strong>Drop a link here</strong>
          <span>or paste below — media formats load automatically for YouTube &amp; similar sites</span>
        </div>

        <form className="download-form new-download-form" onSubmit={onSubmit}>
          <ServerDownloadBanner compact />

          <div className="new-download-grid">
            <div className="new-download-main">
              <div className="new-download-section">
                <h3 className="new-download-section-title">Link</h3>
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
                      <p className="url-detect-hint url-detect-hint--boxed">
                        Detected: <strong>{platformName}</strong>
                        {isMediaUrl && (
                          <>
                            {' '}
                            → <strong>{downloadEngine === 'yt-dlp' ? 'yt-dlp' : 'Direct HTTP'}</strong>
                          </>
                        )}
                      </p>
                    )}
                    {cookiesHint && (
                      <p className="url-detect-hint cookies-hint">
                        Private content may need cookies — <strong>Platform Auth</strong>.
                      </p>
                    )}
                    {needsAgeCookies && (
                      <p className="url-detect-hint age-gate-hint">
                        18+ site: set up browser cookies in <strong>Platform Auth</strong> if needed.
                      </p>
                    )}
                    {isMediaUrl && probing && !probeInfo && (
                      <p className="url-detect-hint url-detect-hint--status">Fetching media formats…</p>
                    )}
                  </>
                ) : (
                  <>
                    <label htmlFor="bulk">URLs (one per line, up to 50)</label>
                    <textarea
                      id="bulk"
                      className="bulk-url-textarea"
                      placeholder={'https://example.com/file1.mkv\nhttps://youtube.com/playlist?list=...\nhttps://example.com/file2.zip'}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      rows={8}
                      required
                    />
                    {bulkLineCount > 0 && (
                      <p className="url-detect-hint url-detect-hint--boxed">
                        {bulkPreviewLoading
                          ? 'Analyzing URLs in parallel…'
                          : bulkPreview
                            ? (
                              <>
                                <strong>{bulkPreview.validCount}</strong> valid
                                {bulkPreview.mediaCount > 0 && (
                                  <> · <strong>{bulkPreview.mediaCount}</strong> media</>
                                )}
                                {bulkPreview.httpCount > 0 && (
                                  <> · <strong>{bulkPreview.httpCount}</strong> HTTP</>
                                )}
                                {bulkPreview.playlistCount > 0 && (
                                  <> · <strong>{bulkPreview.playlistCount}</strong> playlist(s)</>
                                )}
                                {bulkExpandPlaylists && bulkExpandedCount > bulkPreview.validCount && (
                                  <> → <strong>{bulkExpandedCount}</strong> total jobs</>
                                )}
                                {bulkPreview.validCount < bulkLineCount && (
                                  <> · {bulkLineCount - bulkPreview.validCount} skipped</>
                                )}
                              </>
                            )
                            : `${bulkLineCount} line(s) — filenames resolve when queued`}
                      </p>
                    )}
                    {bulkPreview?.items?.length > 0 && (
                      <ul className="bulk-preview-list">
                        {bulkPreview.items.filter((i) => i.valid).slice(0, 12).map((item) => (
                          <li key={item.url} className="bulk-preview-item">
                            <span className={`bulk-preview-type bulk-preview-type-${item.type}`}>
                              {item.isPlaylist
                                ? `${item.playlist?.kindLabel || 'Playlist'}${item.playlist?.entryCount ? ` (${item.playlist.entryCount})` : ''}`
                                : item.type === 'media'
                                  ? 'Media'
                                  : 'HTTP'}
                            </span>
                            <span className="bulk-preview-name">
                              {item.filename || item.platform || item.url}
                            </span>
                            {item.fileSize ? (
                              <span className="bulk-preview-size">{formatBytes(item.fileSize)}</span>
                            ) : null}
                          </li>
                        ))}
                        {bulkPreview.validCount > 12 && (
                          <li className="bulk-preview-more">
                            +{bulkPreview.validCount - 12} more…
                          </li>
                        )}
                      </ul>
                    )}
                  </>
                )}

                <div className="form-toolbar new-download-toolbar">
                  <button type="button" className="btn-secondary btn-sm" onClick={onPasteClipboard}>
                    Paste clipboard
                  </button>
                  {!bulkMode && url.trim() && (
                    <button type="button" className="btn-secondary btn-sm" onClick={onSaveBookmark}>
                      <HiBookmark size={16} />
                      Save bookmark
                    </button>
                  )}
                  {!bulkMode && !isMediaUrl && url.trim() && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={resolvingName}
                      onClick={onResolveFilename}
                    >
                      {resolvingName ? 'Resolving…' : 'Refresh filename'}
                    </button>
                  )}
                  {!bulkMode && appSettings?.aiRename?.configured && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={suggestingName || !url.trim()}
                      onClick={onSuggestName}
                      title="Uses Gemini/OpenAI when available; falls back to instant local naming"
                    >
                      {suggestingName ? 'Naming…' : '✨ AI name'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <aside className="new-download-side">
              <div className="new-download-section new-download-options-card">
                <h3 className="new-download-section-title">
                  <HiCog6Tooth size={16} aria-hidden />
                  Options
                </h3>

                {!bulkMode && (
                  <>
                    <label htmlFor="filename">
                      Filename
                      {resolvingName && (
                        <span className="filename-ai-hint"> · resolving…</span>
                      )}
                    </label>
                    <input
                      id="filename"
                      type="text"
                      placeholder="Auto from server for direct links"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                    />
                  </>
                )}

                {showConnections && (
                  <div className="connections-panel">
                    <div className="connections-header">
                      <span className="connections-title">Parallel connections</span>
                      <span className="connections-badge">
                        {connections}
                        {connections <= 4 ? ' · gentle' : connections >= maxConnections - 2 ? ' · turbo' : ''}
                      </span>
                    </div>
                    <div className="connections-presets" role="group" aria-label="Speed preset">
                      <button
                        type="button"
                        className={`connections-preset ${connections <= 4 ? 'active' : ''}`}
                        onClick={() => setConnections(4)}
                      >
                        Gentle (4)
                      </button>
                      <button
                        type="button"
                        className={`connections-preset ${connections >= maxConnections - 2 ? 'active' : ''}`}
                        onClick={() => setConnections(maxConnections)}
                      >
                        Turbo ({maxConnections})
                      </button>
                    </div>
                    <input
                      id="connections"
                      className="connections-range"
                      type="range"
                      min="1"
                      max={maxConnections}
                      value={Math.min(connections, maxConnections)}
                      onChange={(e) => setConnections(Number(e.target.value))}
                      aria-label="Parallel connections"
                    />
                    <p className="connections-hint">
                      Fewer connections = lighter load on your home network. Media downloads use separate yt-dlp limits.
                    </p>
                  </div>
                )}

                {!showConnections && !bulkMode && (
                  <p className="connections-hint connections-hint--media">
                    Media downloads use yt-dlp with gentle parallel fragments — pick a format below after probe finishes.
                  </p>
                )}

                {bulkMode && bulkLineCount > 0 && (
                  <div className="bulk-media-options">
                    <p className="bulk-media-options-label">Media format (all media URLs)</p>
                    <BulkMediaFormatPicker
                      formatId={bulkFormatId}
                      mediaKind={bulkMediaKind}
                      onSelect={selectBulkFormat}
                    />
                  </div>
                )}

                {bulkMode && (
                  <label className="playlist-toggle bulk-playlist-toggle">
                    <input
                      type="checkbox"
                      checked={bulkExpandPlaylists}
                      onChange={(e) => setBulkExpandPlaylists(e.target.checked)}
                    />
                      <span>
                        Download full playlists &amp; Mixes
                        <span className="playlist-toggle-hint">
                          YouTube playlists, Mix/Radio (RD…), SoundCloud sets — each video becomes its own job.
                          Watch Later / Liked need YouTube cookies in Platform Auth.
                        </span>
                      </span>
                  </label>
                )}

                <label
                  className={`ai-toggle new-download-ai-toggle ${!appSettings?.aiRename?.configured ? 'disabled' : ''}`}
                  title={
                    appSettings?.aiRename?.configured
                      ? 'Optional post-download rename — skips API if quota is exceeded'
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
                    AI smart naming (after download)
                    {appSettings?.aiRename?.provider === 'Google Gemini' && ' · Gemini'}
                  </span>
                  {appSettings?.aiRename?.enabled && (
                    <span className="ai-badge">
                      {appSettings.aiRename.provider === 'Google Gemini' ? 'GEMINI' : 'ON'}
                    </span>
                  )}
                </label>
              </div>
            </aside>
          </div>

          {!bulkMode && isMediaUrl && (
            <>
              <SectionDivider label="Available formats" />
              {probeInfo ? (
                <div className="media-picker new-download-media new-download-media--full">
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
                  {probeInfo.playlist?.entryCount > 1 && (
                    <label className="playlist-toggle">
                      <input
                        type="checkbox"
                        checked={expandPlaylist}
                        onChange={(e) => setExpandPlaylist(e.target.checked)}
                      />
                      <span>
                        Download full {probeInfo.playlist.kindLabel?.toLowerCase() || 'playlist'}
                        <strong> ({probeInfo.playlist.entryCount} videos)</strong>
                        {probeInfo.playlist.playlistTitle && (
                          <span className="playlist-toggle-hint"> — {probeInfo.playlist.playlistTitle}</span>
                        )}
                        {probeInfo.playlist.requiresAuth && (
                          <span className="playlist-toggle-hint playlist-toggle-hint--auth">
                            Private library list — import YouTube cookies in Platform Auth first.
                          </span>
                        )}
                      </span>
                    </label>
                  )}
                  <MediaFormatPicker
                    probeInfo={probeInfo}
                    onSelect={onQueueMedia}
                    showHints
                  />
                </div>
              ) : (
                <div className="media-picker media-picker--empty">
                  {probing ? (
                    <p className="url-detect-hint url-detect-hint--status">Loading formats from server…</p>
                  ) : (
                    <>
                      <p className="url-detect-hint">Paste a media URL above or click Fetch formats.</p>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={!url.trim()}
                        onClick={onProbe}
                      >
                        Fetch Media Formats
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <SectionDivider label="Queue" />

          <div className="new-download-footer">
            <div className="form-actions new-download-actions">
              <button type="submit" className="btn-primary btn-lg" disabled={loading}>
                {loading
                  ? 'Queueing…'
                  : bulkMode
                    ? bulkExpandPlaylists && bulkExpandedCount > bulkLineCount
                      ? `Queue ${bulkExpandedCount} downloads`
                      : 'Queue all downloads'
                    : isMediaUrl
                      ? probeInfo?.playlist?.entryCount > 1 && expandPlaylist
                        ? `Queue playlist (${probeInfo.playlist.entryCount})`
                        : 'Queue best (yt-dlp)'
                      : 'Direct Download (HTTP)'}
              </button>
              {!bulkMode && isMediaUrl && probeInfo && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={probing || !url.trim()}
                  onClick={onProbe}
                >
                  {probing ? 'Refreshing…' : 'Refresh formats'}
                </button>
              )}
            </div>
            {error && <p className="form-error new-download-error">{error}</p>}
          </div>

          {!bulkMode && recentUrls.length > 0 && (
            <>
              <SectionDivider label="Recent URLs" />
              <div className="recent-urls new-download-recent">
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
            </>
          )}
        </form>
      </div>
    </section>
  );
}
