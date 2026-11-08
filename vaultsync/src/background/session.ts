// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Unlocked-state management that survives MV3 service-worker restarts.
//
// Chrome stops an idle extension service worker after ~30 s. If the key lived only in a
// JS variable, the vault would re-lock every time that happens. Instead, while unlocked,
// the derived AES key is parked in chrome.storage.session:
//   - it is held in RAM only (never written to disk),
//   - it is wiped automatically when the browser closes,
//   - with accessLevel TRUSTED_CONTEXTS, content scripts cannot read it.
// Locking (manual or auto-lock) deletes it. If it is missing - browser restart, crash,
// or a restart after lock - the vault is treated as locked: the graceful re-lock path.

import { SESSION } from '../shared/constants';
import { exportRawKey, fromBase64, importRawKey, toBase64 } from './crypto';

interface StoredSessionKey {
  key: string; // base64 raw AES key
  salt: string; // base64 KDF salt of the vault it unlocks
  iterations: number;
}

export interface SessionKey {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

// In-memory cache so we do not re-import the key on every message. Lost on worker
// restart, then rebuilt from chrome.storage.session.
let cached: SessionKey | null = null;

/** Make sure untrusted contexts (content scripts) can never read session storage. */
export async function restrictSessionAccess(): Promise<void> {
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Older Chrome: TRUSTED_CONTEXTS is already the default.
  }
}

export async function storeSessionKey(
  key: CryptoKey,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<void> {
  const stored: StoredSessionKey = { key: await exportRawKey(key), salt: toBase64(salt), iterations };
  await chrome.storage.session.set({ [SESSION.KEY]: stored });
  cached = { key, salt, iterations };
  await touchActivity();
}

export async function getSessionKey(): Promise<SessionKey | null> {
  if (cached) return cached;
  const result = await chrome.storage.session.get(SESSION.KEY);
  const stored = result[SESSION.KEY] as StoredSessionKey | undefined;
  if (!stored) return null;
  cached = {
    key: await importRawKey(stored.key),
    salt: fromBase64(stored.salt),
    iterations: stored.iterations,
  };
  return cached;
}

/** SECURITY: drops every copy of the key - memory cache and session storage. */
export async function clearSessionKey(): Promise<void> {
  cached = null;
  await chrome.storage.session.remove([SESSION.KEY, SESSION.LAST_ACTIVITY]);
}

export async function touchActivity(): Promise<void> {
  await chrome.storage.session.set({ [SESSION.LAST_ACTIVITY]: Date.now() });
}

export async function getLastActivity(): Promise<number | null> {
  const result = await chrome.storage.session.get(SESSION.LAST_ACTIVITY);
  const value = result[SESSION.LAST_ACTIVITY];
  return typeof value === 'number' ? value : null;
}

/** For tests: forget the in-memory cache, as a service-worker restart would. */
export function simulateWorkerRestart(): void {
  cached = null;
}
