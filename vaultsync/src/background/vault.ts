// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Vault lifecycle and CRUD. The decrypted vault only ever exists inside this service
// worker's memory while unlocked. Every change is re-encrypted with a fresh IV and
// written to chrome.storage.local as a base64 envelope - plaintext never touches disk.

import { CRYPTO, LIMITS, SESSION, STORAGE } from '../shared/constants';
import type {
  Credential,
  CredentialSecret,
  CredentialSummary,
  ExportFile,
  LogEvent,
  PendingCapture,
  UpsertResult,
  Vault,
} from '../shared/types';
import {
  decryptJson,
  deriveKey,
  encryptJson,
  parseBlob,
  randomBytes,
  saltOf,
  unlockBlob,
} from './crypto';
import { clearSessionKey, getSessionKey, storeSessionKey, touchActivity } from './session';

export class LockedError extends Error {
  constructor() {
    super('The vault is locked.');
    this.name = 'LockedError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Decrypted vault cache. Cleared on lock; rebuilt from storage + session key after a
// service-worker restart.
let memoryVault: Vault | null = null;

type ChangeListener = (events: LogEvent[]) => void | Promise<void>;
let changeListener: ChangeListener = () => undefined;

/** drive.ts registers here so vault.ts does not import drive.ts (no circular deps). */
export function onVaultChanged(listener: ChangeListener): void {
  changeListener = listener;
}

// ----------------------------------------------------------------------------- state

export async function getStoredBlob(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE.VAULT);
  const value = result[STORAGE.VAULT];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function hasVault(): Promise<boolean> {
  return (await getStoredBlob()) !== null;
}

export async function isUnlocked(): Promise<boolean> {
  return (await hasVault()) && (await getSessionKey()) !== null;
}

export function validateMasterPassword(password: string): void {
  if (typeof password !== 'string' || password.length < LIMITS.MIN_MASTER_LENGTH) {
    throw new ValidationError(
      `The master password must be at least ${LIMITS.MIN_MASTER_LENGTH} characters long.`,
    );
  }
  if (password.length > LIMITS.MAX_FIELD_LENGTH) {
    throw new ValidationError('The master password is too long.');
  }
}

export async function createVault(password: string): Promise<void> {
  if (await hasVault()) throw new ValidationError('A vault already exists.');
  validateMasterPassword(password);
  const salt = randomBytes(CRYPTO.SALT_BYTES);
  const iterations = CRYPTO.PBKDF2_ITERATIONS;
  const key = await deriveKey(password, salt, iterations);
  const vault: Vault = { version: 1, credentials: [] };
  await chrome.storage.local.set({ [STORAGE.VAULT]: await encryptJson(key, salt, iterations, vault) });
  await storeSessionKey(key, salt, iterations);
  memoryVault = vault;
}

/** Unlocks with the master password. Throws WrongPasswordError on a bad password. */
export async function unlock(password: string): Promise<void> {
  const stored = await getStoredBlob();
  if (!stored) throw new ValidationError('No vault exists yet.');
  const blob = parseBlob(stored);
  const { data, key } = await unlockBlob<Vault>(password, blob);
  memoryVault = normalizeVault(data);
  await storeSessionKey(key, saltOf(blob), blob.kdf.iterations);
}

/** SECURITY: wipes the decrypted vault and every copy of the key. */
export async function lock(): Promise<void> {
  memoryVault = null;
  await clearSessionKey();
}

/** Forget the decrypted vault (tests use this to simulate a worker restart). */
export function dropMemoryVault(): void {
  memoryVault = null;
}

function normalizeVault(data: Vault): Vault {
  if (!data || data.version !== 1 || !Array.isArray(data.credentials)) {
    return { version: 1, credentials: [] };
  }
  for (const c of data.credentials) {
    c.history ??= [];
    c.scheme ??= 'https';
  }
  data.neverSave = Array.isArray(data.neverSave) ? data.neverSave : [];
  return data;
}

interface Loaded {
  vault: Vault;
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

async function load(): Promise<Loaded> {
  const session = await getSessionKey();
  if (!session) throw new LockedError();
  if (!memoryVault) {
    const stored = await getStoredBlob();
    if (!stored) throw new LockedError();
    // Service worker was restarted: rebuild the in-memory vault from the session key.
    memoryVault = normalizeVault(await decryptJson<Vault>(session.key, parseBlob(stored)));
  }
  return { vault: memoryVault, ...session };
}

async function persist(loaded: Loaded, events: LogEvent[]): Promise<void> {
  const serialized = await encryptJson(loaded.key, loaded.salt, loaded.iterations, loaded.vault);
  await chrome.storage.local.set({ [STORAGE.VAULT]: serialized });
  memoryVault = loaded.vault;
  await touchActivity();
  await changeListener(events);
}

// ----------------------------------------------------------------------------- reads

function sortByRecent(list: Credential[]): Credential[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSummaries(): Promise<CredentialSummary[]> {
  const { vault } = await load();
  await touchActivity();
  return sortByRecent(vault.credentials)
    .map(({ id, host, username, updatedAt }) => ({ id, host, username, updatedAt }))
    .sort((a, b) => a.host.localeCompare(b.host) || a.username.localeCompare(b.username));
}

export async function reveal(id: string): Promise<CredentialSecret> {
  const { vault } = await load();
  const c = vault.credentials.find((x) => x.id === id);
  if (!c) throw new ValidationError('That login no longer exists.');
  await touchActivity();
  return {
    id: c.id,
    host: c.host,
    scheme: c.scheme,
    username: c.username,
    password: c.password,
    history: c.history.map((h) => ({ ...h })),
  };
}

/** Credentials usable for auto-fill on a page. Does not count as user activity. */
export async function credentialsForSite(
  host: string,
  pageScheme: 'https' | 'http',
): Promise<Array<{ username: string; password: string }>> {
  const { vault } = await load();
  return sortByRecent(vault.credentials)
    .filter((c) => c.host === host)
    // SECURITY: a login saved on https is never offered to an http page of the same
    // host, where it could be read by anyone on the network path.
    .filter((c) => !(c.scheme === 'https' && pageScheme === 'http'))
    .map((c) => ({ username: c.username, password: c.password }));
}

/** What saving this login would do - used to decide whether to show the save prompt. */
export async function previewUpsert(host: string, username: string, password: string): Promise<UpsertResult> {
  const { vault } = await load();
  const existing = vault.credentials.find(
    (c) => c.host === host && c.username.toLowerCase() === username.trim().toLowerCase(),
  );
  if (!existing) return 'new';
  return existing.password === password ? 'unchanged' : 'updated';
}

/** True if the user chose "Never" for this site. */
export async function isNeverSave(host: string): Promise<boolean> {
  const { vault } = await load();
  return (vault.neverSave ?? []).includes(host);
}

export async function listNeverSave(): Promise<string[]> {
  const { vault } = await load();
  await touchActivity();
  return [...(vault.neverSave ?? [])].sort();
}

export async function addNeverSave(host: string): Promise<void> {
  const loaded = await load();
  const list = new Set(loaded.vault.neverSave ?? []);
  list.add(host);
  loaded.vault.neverSave = [...list];
  await persist(loaded, []);
}

export async function removeNeverSave(host: string): Promise<string[]> {
  const loaded = await load();
  loaded.vault.neverSave = (loaded.vault.neverSave ?? []).filter((h) => h !== host);
  await persist(loaded, []);
  return [...loaded.vault.neverSave].sort();
}

// ----------------------------------------------------------------------------- writes

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function clean(value: string, label: string, required: boolean): string {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be text.`);
  const v = label === 'Password' ? value : value.trim();
  if (required && !v) throw new ValidationError(`${label} is required.`);
  if (v.length > LIMITS.MAX_FIELD_LENGTH) throw new ValidationError(`${label} is too long.`);
  return v;
}

function pushHistory(c: Credential, oldPassword: string, changedAt: string): void {
  c.history.unshift({ password: oldPassword, changedAt });
  c.history.length = Math.min(c.history.length, LIMITS.HISTORY_SIZE);
}

/**
 * Save a login, de-duplicated by host + username: an existing entry gets its password
 * updated (old one kept in history) instead of creating a duplicate.
 */
export async function upsert(
  host: string,
  scheme: 'https' | 'http',
  username: string,
  password: string,
): Promise<{ id: string; result: UpsertResult }> {
  const h = clean(host, 'Site', true);
  const u = clean(username, 'Username', false);
  const p = clean(password, 'Password', true);
  const loaded = await load();
  const timestamp = now();
  const existing = loaded.vault.credentials.find(
    (c) => c.host === h && c.username.toLowerCase() === u.toLowerCase(),
  );
  if (existing) {
    if (existing.password === p) {
      await touchActivity();
      return { id: existing.id, result: 'unchanged' };
    }
    pushHistory(existing, existing.password, timestamp);
    existing.password = p;
    existing.updatedAt = timestamp;
    if (scheme === 'https') existing.scheme = 'https';
    await persist(loaded, [{ timestamp, host: h, username: existing.username, action: 'updated' }]);
    return { id: existing.id, result: 'updated' };
  }
  const credential: Credential = {
    id: newId(),
    host: h,
    scheme,
    username: u,
    password: p,
    createdAt: timestamp,
    updatedAt: timestamp,
    history: [],
  };
  loaded.vault.credentials.push(credential);
  await persist(loaded, [{ timestamp, host: h, username: u, action: 'new' }]);
  return { id: credential.id, result: 'new' };
}

/** Edit from the popup (may rename host/username as well as change the password). */
export async function update(
  id: string,
  host: string,
  scheme: 'https' | 'http',
  username: string,
  password: string,
): Promise<void> {
  const h = clean(host, 'Site', true);
  const u = clean(username, 'Username', false);
  const p = clean(password, 'Password', true);
  const loaded = await load();
  const c = loaded.vault.credentials.find((x) => x.id === id);
  if (!c) throw new ValidationError('That login no longer exists.');
  const clash = loaded.vault.credentials.find(
    (x) => x.id !== id && x.host === h && x.username.toLowerCase() === u.toLowerCase(),
  );
  if (clash) throw new ValidationError(`A login for ${u || '(no username)'} on ${h} already exists.`);
  const timestamp = now();
  const passwordChanged = c.password !== p;
  if (passwordChanged) pushHistory(c, c.password, timestamp);
  c.host = h;
  c.scheme = scheme;
  c.username = u;
  c.password = p;
  c.updatedAt = timestamp;
  await persist(
    loaded,
    passwordChanged ? [{ timestamp, host: h, username: u, action: 'updated' }] : [],
  );
}

export async function remove(id: string): Promise<void> {
  const loaded = await load();
  const before = loaded.vault.credentials.length;
  loaded.vault.credentials = loaded.vault.credentials.filter((c) => c.id !== id);
  if (loaded.vault.credentials.length === before) throw new ValidationError('That login no longer exists.');
  await persist(loaded, []);
}

// ----------------------------------------------------------------------------- locked captures

/**
 * Captures that arrive while locked are held in chrome.storage.session (RAM only, never
 * on disk, unreadable by content scripts) until the user unlocks. If the browser closes
 * first, they are discarded.
 */
export async function queuePendingCapture(capture: PendingCapture): Promise<number> {
  const result = await chrome.storage.session.get(SESSION.PENDING_CAPTURES);
  const list = (result[SESSION.PENDING_CAPTURES] as PendingCapture[] | undefined) ?? [];
  const idx = list.findIndex(
    (p) => p.host === capture.host && p.username.toLowerCase() === capture.username.toLowerCase(),
  );
  if (idx >= 0) list[idx] = capture;
  else list.push(capture);
  await chrome.storage.session.set({ [SESSION.PENDING_CAPTURES]: list.slice(-50) });
  return list.length;
}

export async function pendingCaptureCount(): Promise<number> {
  const result = await chrome.storage.session.get(SESSION.PENDING_CAPTURES);
  return ((result[SESSION.PENDING_CAPTURES] as PendingCapture[] | undefined) ?? []).length;
}

/** Saves queued captures into the (now unlocked) vault. Returns how many changed it. */
export async function processPendingCaptures(): Promise<number> {
  const result = await chrome.storage.session.get(SESSION.PENDING_CAPTURES);
  const list = (result[SESSION.PENDING_CAPTURES] as PendingCapture[] | undefined) ?? [];
  await chrome.storage.session.remove(SESSION.PENDING_CAPTURES);
  let changed = 0;
  for (const p of list) {
    const { result: r } = await upsert(p.host, p.scheme, p.username, p.password);
    if (r !== 'unchanged') changed++;
  }
  return changed;
}

// ----------------------------------------------------------------------------- export / import / reset

export async function exportVault(): Promise<ExportFile> {
  await load(); // must be unlocked
  const stored = await getStoredBlob();
  if (!stored) throw new ValidationError('No vault exists yet.');
  return { format: 'vaultsync-export', version: 1, exportedAt: now(), vault: stored };
}

/**
 * Replaces the vault with an exported one. The export's own master password is required
 * (and becomes the master password from now on). The file stays encrypted end to end.
 */
export async function importVault(fileText: string, password: string): Promise<number> {
  let parsed: Partial<ExportFile>;
  try {
    parsed = JSON.parse(fileText) as Partial<ExportFile>;
  } catch {
    throw new ValidationError('That file is not a VaultSync export (invalid JSON).');
  }
  if (parsed.format !== 'vaultsync-export' || parsed.version !== 1 || typeof parsed.vault !== 'string') {
    throw new ValidationError('That file is not a VaultSync export.');
  }
  return replaceWithBlob(parsed.vault, password);
}

/** Validates a blob with its password, then makes it the active vault (unlocked). */
export async function replaceWithBlob(serialized: string, password: string): Promise<number> {
  const blob = parseBlob(serialized);
  const { data, key } = await unlockBlob<Vault>(password, blob); // WrongPasswordError if bad
  const vault = normalizeVault(data);
  await chrome.storage.local.set({ [STORAGE.VAULT]: serialized.trim() });
  memoryVault = vault;
  await storeSessionKey(key, saltOf(blob), blob.kdf.iterations);
  await changeListener([]); // backup changed
  return vault.credentials.length;
}

/** Stores a downloaded backup as the vault and locks; the user unlocks with its password. */
export async function replaceStoredBlobAndLock(serialized: string): Promise<void> {
  parseBlob(serialized); // validate before overwriting anything
  await lock();
  await chrome.storage.local.set({ [STORAGE.VAULT]: serialized.trim() });
}
