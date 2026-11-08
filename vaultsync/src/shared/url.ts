// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.

/** Lower-cases, trims a trailing dot and strips a leading "www." so www/non-www match. */
export function normalizeHost(hostname: string): string {
  let host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  return host;
}

export interface SiteInfo {
  host: string;
  scheme: 'https' | 'http';
}

/** Site of a web page URL, or null for anything that is not http(s) (chrome://, file://, ...). */
export function siteFromUrl(url: string | undefined | null): SiteInfo | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname) return null;
    return { host: normalizeHost(u.hostname), scheme: u.protocol === 'https:' ? 'https' : 'http' };
  } catch {
    return null;
  }
}

/**
 * Turns what a user types in the "Site" box ("github.com", "https://github.com/login",
 * "WWW.GitHub.com/") into a normalised host. Returns null if it is not a plausible host.
 */
export function parseHostInput(input: string): SiteInfo | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const site = siteFromUrl(withScheme);
  if (!site) return null;
  // Require something that looks like a hostname (letters/digits/dots/hyphens, or an IP).
  if (!/^[a-z0-9.-]+$/.test(site.host) && !/^\[[0-9a-f:]+\]$/.test(site.host)) return null;
  return site;
}
