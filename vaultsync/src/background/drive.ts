// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Google Drive sync via the Drive REST API v3 (plain fetch, no SDK).
//
// Two files live in the user's Drive, both created by this extension:
//   vaultsync-backup.enc        the ENCRYPTED vault blob (same bytes as local storage)
//   vaultsync-activity-log.md   a Markdown table of saves/updates - site, username,
//                               timestamp and action only. NEVER a password.
//
// SECURITY: the OAuth scope is drive.file - the extension can only see files it created,
// not the rest of the user's Drive. The account email comes from getProfileUserInfo
// (the identity.email permission), so no extra "email" OAuth scope is requested.

import { ALARMS, DRIVE, LIMITS, STORAGE } from '../shared/constants';
import type { LogAction, LogEvent, SyncStatus } from '../shared/types';
import { getSettings } from './settings';

export class DriveError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'DriveError';
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super('Google sync is not configured for this build. See the README ("Google Drive sync setup").');
    this.name = 'NotConfiguredError';
  }
}

type FileKind = 'backup' | 'log';

// ----------------------------------------------------------------------------- status

export function isConfigured(manifest: chrome.runtime.Manifest = chrome.runtime.getManifest()): boolean {
  const id = manifest.oauth2?.client_id ?? '';
  return id !== DRIVE.CLIENT_ID_PLACEHOLDER && id.endsWith('.apps.googleusercontent.com');
}

export async function getStatus(): Promise<SyncStatus> {
  const result = await chrome.storage.local.get(STORAGE.SYNC_STATUS);
  const stored = (result[STORAGE.SYNC_STATUS] ?? {}) as Partial<SyncStatus>;
  return {
    connected: stored.connected === true,
    email: stored.email ?? null,
    lastSynced: stored.lastSynced ?? null,
    lastError: stored.lastError ?? null,
    configured: isConfigured(),
  };
}

async function setStatus(patch: Partial<SyncStatus>): Promise<SyncStatus> {
  const next = { ...(await getStatus()), ...patch };
  const { configured: _configured, ...persisted } = next;
  await chrome.storage.local.set({ [STORAGE.SYNC_STATUS]: persisted });
  return next;
}

// ----------------------------------------------------------------------------- auth

async function getToken(interactive: boolean): Promise<string> {
  if (!isConfigured()) throw new NotConfiguredError();
  // Chrome caches and refreshes this token itself; we only drop it on a 401.
  const result = await chrome.identity.getAuthToken({ interactive, scopes: [DRIVE.SCOPE] });
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new DriveError(401, 'Google did not return an access token.');
  return token;
}

async function profileEmail(): Promise<string | null> {
  try {
    const info = await chrome.identity.getProfileUserInfo({
      accountStatus: 'ANY' as chrome.identity.AccountStatus,
    });
    return info.email || null;
  } catch {
    return null;
  }
}

/** fetch() with a Bearer token. On 401 the cached token is dropped and retried once. */
async function driveFetch(url: string, init: RequestInit = {}, interactive = false): Promise<Response> {
  let token = await getToken(interactive);
  const run = (t: string) =>
    fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } });
  let res = await run(token);
  if (res.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token });
    token = await getToken(interactive);
    res = await run(token);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* non-JSON error body */
    }
    const hint = res.status === 429 || res.status === 403 ? ' (rate limit or permission)' : '';
    throw new DriveError(res.status, `Google Drive error ${res.status}${hint}${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

// ----------------------------------------------------------------------------- files

async function cachedIds(): Promise<Partial<Record<FileKind, string>>> {
  const result = await chrome.storage.local.get(STORAGE.DRIVE_FILES);
  return (result[STORAGE.DRIVE_FILES] ?? {}) as Partial<Record<FileKind, string>>;
}

async function setCachedId(kind: FileKind, id: string | undefined): Promise<void> {
  const ids = await cachedIds();
  if (id) ids[kind] = id;
  else delete ids[kind];
  await chrome.storage.local.set({ [STORAGE.DRIVE_FILES]: ids });
}

export async function findFileId(name: string): Promise<string | null> {
  const q = `name = '${name}' and trashed = false`;
  const url =
    `${DRIVE.API}?q=${encodeURIComponent(q)}&spaces=drive` +
    `&fields=${encodeURIComponent('files(id,name,modifiedTime)')}` +
    `&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=1`;
  const res = await driveFetch(url);
  const body = (await res.json()) as { files?: Array<{ id: string }> };
  return body.files?.[0]?.id ?? null;
}

async function createFile(name: string, mimeType: string): Promise<string> {
  // Metadata-only create in the Drive root; content is uploaded with PATCH afterwards.
  const res = await driveFetch(`${DRIVE.API}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name, mimeType }),
  });
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new DriveError(500, 'Google Drive did not return a file ID.');
  return body.id;
}

async function ensureFile(kind: FileKind, name: string, mime: string): Promise<{ id: string; created: boolean }> {
  const cached = (await cachedIds())[kind];
  if (cached) return { id: cached, created: false };
  const found = await findFileId(name);
  if (found) {
    await setCachedId(kind, found);
    return { id: found, created: false };
  }
  const id = await createFile(name, mime);
  await setCachedId(kind, id);
  return { id, created: true };
}

/** Runs fn against the file; if a cached ID is stale (deleted file -> 404), re-resolves once. */
async function withFile<T>(
  kind: FileKind,
  name: string,
  mime: string,
  fn: (id: string, created: boolean) => Promise<T>,
): Promise<T> {
  const { id, created } = await ensureFile(kind, name, mime);
  try {
    return await fn(id, created);
  } catch (err) {
    if (err instanceof DriveError && err.status === 404) {
      await setCachedId(kind, undefined);
      const again = await ensureFile(kind, name, mime);
      return fn(again.id, again.created);
    }
    throw err;
  }
}

async function uploadMedia(id: string, content: string, mime: string): Promise<void> {
  await driveFetch(`${DRIVE.UPLOAD}/${encodeURIComponent(id)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': `${mime}; charset=UTF-8` },
    body: content,
  });
}

async function downloadText(id: string): Promise<string> {
  const res = await driveFetch(`${DRIVE.API}/${encodeURIComponent(id)}?alt=media`);
  return res.text();
}

// ----------------------------------------------------------------------------- markdown log

const ACTION_LABEL: Record<LogAction, string> = {
  new: '\u2705 New Login Saved',
  updated: '\uD83D\uDD04 Password Updated',
};

/** Escapes text for a Markdown table cell (pipes, backslashes, newlines). */
export function escapeMarkdownCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}

/** One table row. Takes a LogEvent, which by design has no password field. */
export function buildLogRow(event: LogEvent): string {
  const username = event.username ? escapeMarkdownCell(event.username) : '(no username)';
  return `| ${event.timestamp} | ${escapeMarkdownCell(event.host)} | ${username} | ${ACTION_LABEL[event.action]} |`;
}

/** Keeps existing data rows from a previous log file (skips header and separator). */
export function extractLogRows(existing: string): string[] {
  return existing
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Timestamp |'));
}

/** Full log document: fresh header (account + last synced) + old rows + new rows. */
export function buildLogDocument(
  existing: string,
  email: string | null,
  newEvents: LogEvent[],
  syncedAt: string,
): string {
  const rows = [...extractLogRows(existing), ...newEvents.map(buildLogRow)];
  return [
    '# VaultSync Activity Log',
    '',
    `**Account:** ${email ?? '(unknown)'}`,
    `**Last Synced:** ${syncedAt}`,
    '',
    '| Timestamp | Site | Username | Action |',
    '|-----------|------|----------|--------|',
    ...rows,
    '',
  ].join('\n');
}

// ----------------------------------------------------------------------------- sync

let running: Promise<SyncStatus> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Called by the vault on every change: mark backup dirty, queue log rows, schedule sync. */
export async function recordVaultChange(events: LogEvent[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE.BACKUP_DIRTY]: Date.now() });
  if (events.length && (await getSettings()).activityLog) {
    const result = await chrome.storage.local.get(STORAGE.PENDING_LOG);
    const pending = (result[STORAGE.PENDING_LOG] as LogEvent[] | undefined) ?? [];
    // Defence in depth: rebuild each event from known fields only.
    pending.push(
      ...events.map(({ timestamp, host, username, action }) => ({ timestamp, host, username, action })),
    );
    await chrome.storage.local.set({ [STORAGE.PENDING_LOG]: pending.slice(-1000) });
  }
  await scheduleSync();
}

/**
 * Debounced sync: at most one Drive sync per 10 s. A timer handles the normal case; a
 * 30 s alarm is a fallback in case Chrome stops the worker before the timer fires.
 */
export async function scheduleSync(): Promise<void> {
  const status = await getStatus();
  if (!status.configured || !status.connected) return;
  const result = await chrome.storage.local.get(STORAGE.LAST_SYNC_ATTEMPT);
  const last = (result[STORAGE.LAST_SYNC_ATTEMPT] as number | undefined) ?? 0;
  const wait = Math.max(0, last + LIMITS.SYNC_DEBOUNCE_MS - Date.now());
  if (!debounceTimer) {
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncNow().catch(() => undefined);
    }, wait);
  }
  await chrome.alarms.create(ALARMS.DEBOUNCED_SYNC, { delayInMinutes: 0.5 });
}

/** Runs a sync. Concurrent callers share one run. manual=true surfaces errors. */
export function syncNow(opts: { manual?: boolean } = {}): Promise<SyncStatus> {
  if (!running) {
    running = doSync(opts.manual === true).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doSync(manual: boolean): Promise<SyncStatus> {
  let status = await getStatus();
  if (!status.configured) {
    if (manual) throw new NotConfiguredError();
    return status;
  }
  if (!status.connected) {
    if (manual) throw new DriveError(0, 'Connect a Google account on the Options page first.');
    return status;
  }

  // Rate limiting: never more than one sync per SYNC_DEBOUNCE_MS.
  const lastResult = await chrome.storage.local.get(STORAGE.LAST_SYNC_ATTEMPT);
  const last = (lastResult[STORAGE.LAST_SYNC_ATTEMPT] as number | undefined) ?? 0;
  const wait = last + LIMITS.SYNC_DEBOUNCE_MS - Date.now();
  if (wait > 0) {
    if (!manual) {
      await scheduleSync();
      return status;
    }
    await sleep(wait);
  }
  await chrome.storage.local.set({ [STORAGE.LAST_SYNC_ATTEMPT]: Date.now() });

  try {
    if (!status.email) status = await setStatus({ email: await profileEmail() });
    const stored = await chrome.storage.local.get([STORAGE.VAULT, STORAGE.BACKUP_DIRTY, STORAGE.PENDING_LOG]);
    const blob = stored[STORAGE.VAULT] as string | undefined;
    const dirtyStamp = (stored[STORAGE.BACKUP_DIRTY] as number | undefined) ?? 1;

    // 1) Encrypted backup - only the already-encrypted blob is ever uploaded.
    if (blob && (dirtyStamp || manual)) {
      await withFile('backup', DRIVE.BACKUP_NAME, DRIVE.BACKUP_MIME, (id) =>
        uploadMedia(id, blob, DRIVE.BACKUP_MIME),
      );
      // Only clear the dirty flag if nothing changed while we were uploading.
      const after = await chrome.storage.local.get(STORAGE.BACKUP_DIRTY);
      if (after[STORAGE.BACKUP_DIRTY] === stored[STORAGE.BACKUP_DIRTY]) {
        await chrome.storage.local.set({ [STORAGE.BACKUP_DIRTY]: 0 });
      }
    }

    // 2) Markdown activity log (append = download, add rows, re-upload whole file).
    const syncedAt = new Date().toISOString();
    const pending = (stored[STORAGE.PENDING_LOG] as LogEvent[] | undefined) ?? [];
    if ((await getSettings()).activityLog) {
      await withFile('log', DRIVE.LOG_NAME, DRIVE.LOG_MIME, async (id, created) => {
        const existing = created ? '' : await downloadText(id);
        await uploadMedia(id, buildLogDocument(existing, status.email, pending, syncedAt), DRIVE.LOG_MIME);
      });
      // Remove exactly the rows we uploaded; rows added meanwhile stay queued.
      const now = await chrome.storage.local.get(STORAGE.PENDING_LOG);
      const remaining = ((now[STORAGE.PENDING_LOG] as LogEvent[] | undefined) ?? []).slice(pending.length);
      await chrome.storage.local.set({ [STORAGE.PENDING_LOG]: remaining });
    }

    return await setStatus({ lastSynced: syncedAt, lastError: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus({ lastError: message });
    if (manual) throw err;
    return getStatus();
  }
}

// ----------------------------------------------------------------------------- connect / restore

export async function connect(): Promise<SyncStatus> {
  if (!isConfigured()) throw new NotConfiguredError();
  await getToken(true); // shows Google's consent screen the first time
  await setStatus({ connected: true, email: await profileEmail(), lastError: null });
  await chrome.storage.local.set({ [STORAGE.BACKUP_DIRTY]: Date.now() });
  try {
    return await syncNow({ manual: true });
  } catch {
    return getStatus(); // connected, but the first sync failed - lastError explains why
  }
}

export async function disconnect(): Promise<SyncStatus> {
  if (isConfigured()) {
    try {
      const token = await getToken(false);
      await chrome.identity.removeCachedAuthToken({ token });
      // Revoke the grant so the extension no longer has Drive access at all.
      await fetch(`${DRIVE.REVOKE}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      /* not signed in / already revoked */
    }
  }
  await chrome.storage.local.remove([STORAGE.DRIVE_FILES, STORAGE.PENDING_LOG, STORAGE.LAST_SYNC_ATTEMPT]);
  return setStatus({ connected: false, email: null, lastError: null, lastSynced: null });
}

/** Downloads the encrypted backup blob from Drive (still encrypted). */
export async function downloadBackup(): Promise<string> {
  const status = await getStatus();
  if (!status.configured) throw new NotConfiguredError();
  if (!status.connected) throw new DriveError(0, 'Connect a Google account first.');
  const id = await findFileId(DRIVE.BACKUP_NAME);
  if (!id) throw new DriveError(404, `No ${DRIVE.BACKUP_NAME} found in your Google Drive.`);
  await setCachedId('backup', id);
  return (await downloadText(id)).trim();
}
