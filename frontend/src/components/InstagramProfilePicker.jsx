import {
  HiUserCircle,
  HiPlayCircle,
  HiSquares2X2,
  HiFilm,
  HiExclamationTriangle,
  HiLockClosed,
} from 'react-icons/hi2';

const TARGET_ICONS = {
  avatar: HiUserCircle,
  story: HiPlayCircle,
  posts: HiSquares2X2,
  reels: HiFilm,
};

function TargetButton({ target, profile, loading, onQueue }) {
  const Icon = TARGET_ICONS[target.icon] || HiSquares2X2;
  const count =
    target.entryCount ??
    (target.id === 'posts'
      ? profile.counts?.posts
      : target.id === 'reels'
        ? profile.counts?.reels
        : null);
  const needsAuth = target.requiresAuth && target.id !== 'avatar';
  const avatarResolving = target.id === 'avatar' && !profile.profilePicUrl && profile.pending;

  return (
    <button
      type="button"
      className={`ig-target-btn${needsAuth ? ' ig-target-btn--auth' : ''}`}
      disabled={loading}
      onClick={() => onQueue(target.id)}
      title={
        avatarResolving
          ? 'Profile picture will be resolved when you click (cookies help for private accounts)'
          : undefined
      }
    >
      <span className="ig-target-icon" aria-hidden>
        <Icon size={20} />
      </span>
      <span className="ig-target-body">
        <span className="ig-target-title-row">
          <strong>{target.label}</strong>
          {needsAuth && (
            <span className="ig-target-badge" title="Cookies recommended">
              <HiLockClosed size={12} aria-hidden />
              Cookies
            </span>
          )}
        </span>
        {count != null && <span className="ig-target-count">{count} items</span>}
        <span className="ig-target-desc">{target.description}</span>
      </span>
    </button>
  );
}

export default function InstagramProfilePicker({ profile, loading = false, onQueue, onQueueHighlight }) {
  if (!profile) return null;

  const displayName = profile.fullName || `@${profile.username}`;

  return (
    <div className="ig-profile-picker">
      <div className="media-head ig-profile-head">
        {profile.profilePicUrl ? (
          <img src={profile.profilePicUrl} alt="" className="ig-profile-avatar" />
        ) : (
          <div className="ig-profile-avatar ig-profile-avatar--placeholder" aria-hidden>
            <HiUserCircle size={40} />
          </div>
        )}
        <div>
          <p className="media-title">{displayName}</p>
          <p className="media-sub">@{profile.username}</p>
          <span className="media-source">Instagram</span>
          {(profile.counts?.posts != null || profile.counts?.followers != null) && (
            <p className="ig-profile-stats">
              {profile.counts.posts != null && <span>{profile.counts.posts} posts</span>}
              {profile.counts.followers != null && <span>{profile.counts.followers} followers</span>}
            </p>
          )}
          {profile.biography && <p className="ig-profile-bio">{profile.biography}</p>}
        </div>
      </div>

      {profile.pending && (
        <div className="ig-profile-banner" role="status">
          <HiExclamationTriangle className="ig-profile-banner-icon" aria-hidden />
          <div className="ig-profile-banner-copy">
            <strong>Limited profile data</strong>
            <p>
              Full profile stats unavailable from this server. Profile picture can still be downloaded — add Instagram cookies in{' '}
              <strong>Platform Auth</strong> for private accounts or posts/reels/stories.
            </p>
          </div>
        </div>
      )}

      {profile.isPrivate && !profile.pending && (
        <div className="ig-profile-banner ig-profile-banner--auth" role="status">
          <HiLockClosed className="ig-profile-banner-icon" aria-hidden />
          <div className="ig-profile-banner-copy">
            <strong>Private profile</strong>
            <p>Import Instagram cookies in Platform Auth before downloading.</p>
          </div>
        </div>
      )}

      <p className="media-label ig-section-label">What to download</p>
      <div className="ig-target-grid">
        {(profile.targets || []).map((target) => (
          <TargetButton
            key={target.id}
            target={target}
            profile={profile}
            loading={loading}
            onQueue={onQueue}
          />
        ))}
      </div>

      {profile.highlights?.length > 0 && (
        <>
          <p className="media-label ig-section-label">Story highlights</p>
          <div className="ig-highlights-list">
            {profile.highlights.map((hl) => (
              <button
                key={hl.id}
                type="button"
                className="ig-highlight-btn"
                disabled={loading}
                onClick={() => onQueueHighlight(hl.id)}
              >
                {hl.coverUrl ? (
                  <img src={hl.coverUrl} alt="" className="ig-highlight-cover" />
                ) : (
                  <span className="ig-highlight-cover ig-highlight-cover--placeholder" aria-hidden>
                    <HiPlayCircle size={20} />
                  </span>
                )}
                <span className="ig-highlight-body">
                  <strong>{hl.title}</strong>
                  {hl.entryCount != null && (
                    <span className="ig-target-count">{hl.entryCount} items</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="ig-profile-note">
        Profile picture works for public and private accounts (cookies for private). Posts, reels, and stories need Instagram cookies in{' '}
        <strong>Platform Auth</strong>.
      </p>
    </div>
  );
}
