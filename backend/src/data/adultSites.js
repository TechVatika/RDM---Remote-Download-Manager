import { PLATFORM_URL_RULES } from './platformHosts.js';

/** Host fragments for platforms that need WARP/proxy (age-gated adult sites). */
export const ADULT_SITE_FRAGMENTS = PLATFORM_URL_RULES.filter((r) => r.ageGate).flatMap(
  (r) => r.fragments,
);

export const ADULT_SITE_NAMES = PLATFORM_URL_RULES.filter((r) => r.ageGate).map((r) => r.name);

function hostMatchesAdultFragment(host) {
  const h = host.toLowerCase().replace(/^www\./, '');
  return ADULT_SITE_FRAGMENTS.some((frag) => h === frag || h.endsWith(`.${frag}`) || h.includes(frag));
}

/** True only for age-gated adult platforms — WARP/proxy must never apply elsewhere. */
export function isAdultSiteUrl(url) {
  try {
    const host = new URL(String(url).trim()).hostname.toLowerCase();
    return hostMatchesAdultFragment(host);
  } catch {
    return false;
  }
}
