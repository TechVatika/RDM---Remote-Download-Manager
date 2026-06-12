import { HiArrowDownTray, HiExclamationTriangle, HiFilm, HiPhoto, HiPlayCircle } from 'react-icons/hi2';
import MediaFormatPicker from './MediaFormatPicker.jsx';

const KIND_ICONS = {
  post: HiPhoto,
  reel: HiFilm,
  highlight: HiPlayCircle,
  story: HiPlayCircle,
};

export default function InstagramMediaPicker({
  probeInfo,
  loading = false,
  onDownload,
  onSelectFormat,
  showFormats = false,
}) {
  const direct = probeInfo?.instagramDirectMedia;
  const kind = direct?.label || 'Media';
  const Icon = KIND_ICONS[direct?.kind] || HiFilm;
  const previewUnavailable = probeInfo?.instagramMediaFallback;
  const displayTitle = probeInfo?.caption || probeInfo?.title || `Instagram ${kind}`;

  return (
    <div className="ig-profile-picker ig-media-picker">
      <div className="media-head ig-profile-head">
        {probeInfo?.thumbnail ? (
          <img src={probeInfo.thumbnail} alt="" className="ig-profile-avatar ig-profile-avatar--thumb" />
        ) : (
          <div className="ig-profile-avatar ig-profile-avatar--placeholder" aria-hidden>
            <Icon size={36} />
          </div>
        )}
        <div>
          <p className="media-title">{displayTitle}</p>
          {probeInfo?.uploader && !probeInfo?.caption && (
            <p className="media-sub">@{probeInfo.uploader}</p>
          )}
          <span className="media-source">Instagram · {kind}</span>
        </div>
      </div>

      {previewUnavailable && (
        <div className="ig-profile-banner" role="status">
          <HiExclamationTriangle className="ig-profile-banner-icon" aria-hidden />
          <div className="ig-profile-banner-copy">
            <strong>Preview unavailable</strong>
            <p>
              You can still download — add Instagram session cookies in <strong>Platform Auth</strong> if the content is private or login-walled.
            </p>
          </div>
        </div>
      )}

      <div className="ig-media-download-row">
        <button
          type="button"
          className="btn-primary"
          disabled={loading}
          onClick={() => onDownload('best', 'video')}
        >
          <HiArrowDownTray size={18} aria-hidden />
          Download {kind}
        </button>
      </div>

      {showFormats && !previewUnavailable && (
        <MediaFormatPicker probeInfo={probeInfo} onSelect={onSelectFormat} showHints />
      )}
    </div>
  );
}
