import {
  buildVideoFormatOptions,
  availabilityTitle,
  formatMaxSourceLabel,
} from '../utils/mediaFormats.js';

function FormatChip({
  label,
  formatId,
  mediaKind,
  availability,
  active,
  onSelect,
  maxVideoHeight,
  variant = 'video',
}) {
  const classNames = [
    'chip',
    variant === 'best' ? 'chip-best' : '',
    variant === 'audio' ? 'chip-audio' : '',
    active ? 'active' : '',
    availability === 'exact' ? 'chip-format-exact' : '',
    availability === 'fallback' ? 'chip-format-fallback' : '',
    availability === 'unknown' ? 'chip-format-unknown' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classNames}
      onClick={() => onSelect(formatId, mediaKind)}
      title={availability ? availabilityTitle(availability, maxVideoHeight) : undefined}
    >
      {label}
      {availability === 'exact' && <span className="chip-format-badge">✓</span>}
      {availability === 'fallback' && <span className="chip-format-badge chip-format-badge--dim">↓</span>}
    </button>
  );
}

/**
 * Video + audio format chips. Shows full 8K→144p ladder; marks what the probe found on source.
 */
export default function MediaFormatPicker({
  probeInfo = null,
  formatId = null,
  mediaKind = 'video',
  onSelect,
  showHints = true,
  compact = false,
}) {
  const { standard, extras } = buildVideoFormatOptions(showHints ? probeInfo : null);
  const maxLabel = formatMaxSourceLabel(probeInfo?.maxVideoHeight);
  const showAudio = !showHints || probeInfo?.audioAvailable !== false;

  const isActive = (id, kind) => mediaKind === kind && (formatId === id || (kind === 'audio' && !formatId));

  return (
    <div className={`media-format-picker ${compact ? 'media-format-picker--compact' : ''}`}>
      {showHints && maxLabel && (
        <p className="media-format-source-hint">
          Source max: <strong>{maxLabel}</strong>
          {probeInfo?.availableHeights?.length > 1 && (
            <> · {probeInfo.availableHeights.length} video streams detected</>
          )}
        </p>
      )}

      <p className="media-label">Video (MP4)</p>
      <div className="media-options media-options--formats">
        <FormatChip
          label="Best quality"
          formatId="best"
          mediaKind="video"
          availability={showHints && probeInfo?.availableHeights?.length ? 'exact' : 'unknown'}
          active={isActive('best', 'video')}
          onSelect={onSelect}
          variant="best"
          maxVideoHeight={probeInfo?.maxVideoHeight}
        />
        {standard.map((opt) => (
          <FormatChip
            key={opt.formatId}
            label={opt.label}
            formatId={opt.formatId}
            mediaKind="video"
            availability={showHints ? opt.availability : 'unknown'}
            active={isActive(opt.formatId, 'video')}
            onSelect={onSelect}
            maxVideoHeight={probeInfo?.maxVideoHeight}
          />
        ))}
      </div>

      {extras.length > 0 && (
        <>
          <p className="media-label media-label--sub">Other resolutions on this video</p>
          <div className="media-options media-options--formats">
            {extras.map((opt) => (
              <FormatChip
                key={opt.formatId}
                label={opt.label}
                formatId={opt.formatId}
                mediaKind="video"
                availability="exact"
                active={isActive(opt.formatId, 'video')}
                onSelect={onSelect}
                maxVideoHeight={probeInfo?.maxVideoHeight}
              />
            ))}
          </div>
        </>
      )}

      {showAudio && (
        <>
          <p className="media-label">Audio</p>
          <div className="media-options media-options--formats">
            <FormatChip
              label="MP3 (best)"
              formatId={null}
              mediaKind="audio"
              availability={probeInfo?.audioAvailable === false ? 'fallback' : 'exact'}
              active={isActive(null, 'audio')}
              onSelect={onSelect}
              variant="audio"
              maxVideoHeight={probeInfo?.maxVideoHeight}
            />
          </div>
        </>
      )}

      {showHints && !probeInfo?.availableHeights?.length && probeInfo && (
        <p className="media-format-note">
          No video height info from probe — all caps still work; yt-dlp picks the best stream available.
        </p>
      )}
    </div>
  );
}

/** Bulk sidebar: full ladder without per-URL availability. */
export function BulkMediaFormatPicker({ formatId, mediaKind, onSelect }) {
  return (
    <MediaFormatPicker
      formatId={formatId}
      mediaKind={mediaKind}
      onSelect={onSelect}
      showHints={false}
      compact
    />
  );
}
