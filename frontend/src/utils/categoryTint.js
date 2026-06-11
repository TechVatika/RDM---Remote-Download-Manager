/** Dell 1996 ribbon-card tint per download category. */
const TINT_BY_CATEGORY = {
  movies: 'periwinkle',
  software: 'sky',
  general: 'sage',
};

export function categoryRibbonTint(category) {
  return TINT_BY_CATEGORY[category] || 'steel';
}
