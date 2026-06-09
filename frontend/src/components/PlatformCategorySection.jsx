import PlatformIcon from './PlatformIcon.jsx';

export default function PlatformCategorySection({ category }) {
  return (
    <section className="platform-category-section">
      <div className="platform-category-header">
        <h3>{category.label}</h3>
        <span className="cat-engine">{category.engine}</span>
        <span className="cat-count">{category.platforms.length}</span>
      </div>
      <div className="platform-cards">
        {category.platforms.map((p) => (
          <div key={p.name} className="platform-card">
            <PlatformIcon name={p.name} size={22} />
            <div className="platform-card-body">
              <div className="platform-card-head">
                <strong>{p.name}</strong>
                {p.cookies && <span className="cookie-badge">public only</span>}
              </div>
              {p.note && <p>{p.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
