// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Runs in the page's MAIN world (manifest "world": "MAIN") at document_start.
//
// Why: content scripts live in an isolated JavaScript world, so patching
// history.pushState there would NOT see the page's own calls. This tiny script patches
// pushState/replaceState in the page's world and announces navigations with a DOM event
// that the isolated-world auto-fill script listens for.
//
// SECURITY: it has no extension privileges and carries no data - it only fires
// "vaultsync:navigate". A page that fires that event itself can only trigger a re-check
// of its own login form.

(() => {
  const flag = '__vaultsyncHistoryHooked';
  const w = window as unknown as Record<string, unknown>;
  if (w[flag]) return;
  w[flag] = true;

  const announce = () => window.dispatchEvent(new CustomEvent('vaultsync:navigate'));

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function patched(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      announce();
      return result;
    };
  }
  window.addEventListener('popstate', announce);
})();
