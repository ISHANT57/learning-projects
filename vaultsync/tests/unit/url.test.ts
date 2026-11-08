// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import { describe, expect, it } from 'vitest';
import { normalizeHost, parseHostInput, siteFromUrl } from '../../src/shared/url';

describe('url helpers', () => {
  it('normalises hosts', () => {
    expect(normalizeHost('WWW.GitHub.com.')).toBe('github.com');
    expect(normalizeHost('accounts.google.com')).toBe('accounts.google.com');
  });

  it('extracts the site from page URLs and rejects non-web schemes', () => {
    expect(siteFromUrl('https://www.github.com/login?x=1')).toEqual({ host: 'github.com', scheme: 'https' });
    expect(siteFromUrl('http://localhost:8080/')).toEqual({ host: 'localhost', scheme: 'http' });
    expect(siteFromUrl('chrome://settings')).toBeNull();
    expect(siteFromUrl('file:///C:/x.html')).toBeNull();
    expect(siteFromUrl('not a url')).toBeNull();
  });

  it('parses what users type in the Site box', () => {
    expect(parseHostInput('github.com')?.host).toBe('github.com');
    expect(parseHostInput('https://www.GitHub.com/login')?.host).toBe('github.com');
    expect(parseHostInput('http://intranet.local')).toEqual({ host: 'intranet.local', scheme: 'http' });
    expect(parseHostInput('   ')).toBeNull();
    expect(parseHostInput('bad host name!')).toBeNull();
  });
});
