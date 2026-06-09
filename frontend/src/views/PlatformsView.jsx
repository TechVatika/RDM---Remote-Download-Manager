import { FeaturedPlatforms } from '../components/PlatformTile.jsx';
import PlatformCategorySection from '../components/PlatformCategorySection.jsx';
import { FEATURED_PLATFORMS } from '../utils/platformIcons.js';

export default function PlatformsView({
  platformData,
  platformTotal,
  platformCategory,
  setPlatformCategory,
  platformSearch,
  setPlatformSearch,
  filteredCategories,
  categories,
  onNavigate,
}) {
  return (
    <section className="panel platforms-panel">
      <div className="platforms-hero">
        <p className="platform-intro">
          RDM uses <strong>yt-dlp</strong> ({platformData?.extractorCount || '1800+'} sites) and an
          <strong> IDM-style segmented engine</strong> for direct links.
          {' '}<strong>{platformTotal}</strong> platforms listed below.
        </p>
        <FeaturedPlatforms platforms={FEATURED_PLATFORMS} onSelect={() => onNavigate('new')} />
      </div>

      <div className="platform-filters">
        <div className="category-tabs">
          <button
            type="button"
            className={`category-tab ${platformCategory === 'all' ? 'active' : ''}`}
            onClick={() => setPlatformCategory('all')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`category-tab ${platformCategory === cat.id ? 'active' : ''}`}
              onClick={() => setPlatformCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="platform-search"
          placeholder="Search platforms…"
          value={platformSearch}
          onChange={(e) => setPlatformSearch(e.target.value)}
        />
      </div>

      <div className="platform-sections">
        {filteredCategories.map((cat) => (
          <PlatformCategorySection key={cat.id} category={cat} />
        ))}
      </div>

      {platformData?.notSupported && (
        <div className="platform-note">
          <h4>Not supported</h4>
          <ul>
            {platformData.notSupported.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Private Instagram/Facebook needs{' '}
            <button type="button" className="btn-link" onClick={() => onNavigate('platform-settings')}>
              Platform Auth
            </button>{' '}
            and <code>PUBLIC_MEDIA_ONLY=false</code>.
          </p>
        </div>
      )}
    </section>
  );
}
