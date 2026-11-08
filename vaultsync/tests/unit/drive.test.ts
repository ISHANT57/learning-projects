// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Drive sync against an in-memory fake of the Drive REST API v3 endpoints we use.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock, type ChromeMock } from './chromeMock';

interface FakeFile { id: string; name: string; mimeType: string; content: string }

class FakeDrive {
  files = new Map<string, FakeFile>();
  calls: Array<{ method: string; url: string }> = [];
  failNext401 = false;
  private seq = 0;

  fetch = vi.fn(async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    this.calls.push({ method, url: url.toString() });
    const auth = new Headers(init.headers).get('Authorization');
    if (!auth?.startsWith('Bearer ')) return new Response('{}', { status: 401 });
    if (this.failNext401) {
      this.failNext401 = false;
      return new Response(JSON.stringify({ error: { message: 'expired' } }), { status: 401 });
    }
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const name = /name = '([^']+)'/.exec(url.searchParams.get('q') ?? '')?.[1];
      return json({ files: [...this.files.values()].filter((f) => f.name === name).map(({ id, name: n }) => ({ id, name: n })) });
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(String(init.body)) as { name: string; mimeType: string };
      const id = `file-${++this.seq}`;
      this.files.set(id, { id, name: meta.name, mimeType: meta.mimeType, content: '' });
      return json({ id });
    }
    const upload = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (upload && method === 'PATCH') {
      expect(url.searchParams.get('uploadType')).toBe('media');
      const file = this.files.get(decodeURIComponent(upload[1]!));
      if (!file) return json({ error: { message: 'File not found' } }, 404);
      file.content = String(init.body);
      return json({ id: file.id });
    }
    const get = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (get && method === 'GET' && url.searchParams.get('alt') === 'media') {
      const file = this.files.get(decodeURIComponent(get[1]!));
      return file ? new Response(file.content, { status: 200 }) : json({ error: { message: 'File not found' } }, 404);
    }
    return json({ error: { message: `unexpected ${method} ${url}` } }, 400);
  });

  byName(name: string): FakeFile | undefined {
    return [...this.files.values()].find((f) => f.name === name);
  }
}

let chromeMock: ChromeMock;
let fake: FakeDrive;
let drive: typeof import('../../src/background/drive');
let vault: typeof import('../../src/background/vault');

const resetRateLimit = () => chromeMock.storage.local.set({ lastSyncAttempt: 0 });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.resetModules();
  chromeMock = installChromeMock();
  fake = new FakeDrive();
  vi.stubGlobal('fetch', fake.fetch);
  drive = await import('../../src/background/drive');
  vault = await import('../../src/background/vault');
  vault.onVaultChanged((events) => drive.recordVaultChange(events));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('configuration & connection', () => {
  it('reports not configured without a real client ID', async () => {
    vi.resetModules();
    installChromeMock({ clientId: '__GOOGLE_OAUTH_CLIENT_ID__' });
    const d = await import('../../src/background/drive');
    expect((await d.getStatus()).configured).toBe(false);
    await expect(d.syncNow({ manual: true })).rejects.toBeInstanceOf(d.NotConfiguredError);
  });

  it('manual sync before connecting explains what to do', async () => {
    await expect(drive.syncNow({ manual: true })).rejects.toThrow(/Connect a Google account/);
  });

  it('connect creates the backup and log files and stores the email', async () => {
    await vault.createVault('master password 123');
    const status = await drive.connect();
    expect(status.connected).toBe(true);
    expect(status.email).toBe('user@gmail.com');
    expect(status.lastError).toBeNull();
    expect(chromeMock.identity.getAuthToken).toHaveBeenCalledWith({ interactive: true, scopes: ['https://www.googleapis.com/auth/drive.file'] });
    const backup = fake.byName('vaultsync-backup.enc');
    expect(backup?.content).toBe(chromeMock.storage.local.dump().vault);
    const log = fake.byName('vaultsync-activity-log.md')!.content;
    expect(log).toContain('# VaultSync Activity Log');
    expect(log).toContain('**Account:** user@gmail.com');
    expect(log).toContain('| Timestamp | Site | Username | Action |');
  });
});

describe('activity log', () => {
  beforeEach(async () => {
    await vault.createVault('master password 123');
    await drive.connect();
  });

  it('appends rows for new and updated logins and never includes passwords', async () => {
    const SECRET = 'Very$ecretPassw0rd';
    await vault.upsert('github.com', 'https', 'john_doe', SECRET);
    await resetRateLimit();
    await drive.syncNow({ manual: true });
    await vault.upsert('twitter.com', 'https', 'john@x.com', SECRET + 'x');
    await vault.upsert('github.com', 'https', 'john_doe', SECRET + 'y');
    await resetRateLimit();
    await drive.syncNow({ manual: true });

    const log = fake.byName('vaultsync-activity-log.md')!.content;
    const rows = log.split('\n').filter((l) => l.startsWith('| 2'));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/\| github\.com \| john_doe \| ✅ New Login Saved \|$/);
    expect(rows[1]).toMatch(/\| twitter\.com \| john@x\.com \| ✅ New Login Saved \|$/);
    expect(rows[2]).toMatch(/\| github\.com \| john_doe \| 🔄 Password Updated \|$/);
    expect(log).not.toContain(SECRET);
    // the backup is the encrypted blob - no plaintext either
    expect(fake.byName('vaultsync-backup.enc')!.content).not.toContain(SECRET);
    expect(chromeMock.storage.local.dump().pendingLogEvents).toEqual([]);
  });

  it('refreshes the Last Synced header on every sync', async () => {
    const first = /\*\*Last Synced:\*\* (\S+)/.exec(fake.byName('vaultsync-activity-log.md')!.content)?.[1];
    await new Promise((r) => setImmediate(r));
    vi.setSystemTime(Date.now() + 60_000);
    await resetRateLimit();
    await drive.syncNow({ manual: true });
    const second = /\*\*Last Synced:\*\* (\S+)/.exec(fake.byName('vaultsync-activity-log.md')!.content)?.[1];
    expect(second).not.toBe(first);
    vi.useRealTimers();
  });

  it('skips the log when activity logging is off', async () => {
    const settings = await import('../../src/background/settings');
    await settings.updateSettings({ activityLog: false });
    fake.byName('vaultsync-activity-log.md')!.content = 'untouched';
    await vault.upsert('a.com', 'https', 'u', 'pw');
    await resetRateLimit();
    await drive.syncNow({ manual: true });
    expect(fake.byName('vaultsync-activity-log.md')!.content).toBe('untouched');
  });

  it('escapes Markdown table characters in usernames', () => {
    expect(drive.buildLogRow({ timestamp: 't', host: 'a.com', username: 'a|b', action: 'new' })).toContain('a\\|b');
  });
});

describe('robustness', () => {
  beforeEach(async () => {
    await vault.createVault('master password 123');
    await drive.connect();
  });

  it('retries once with a fresh token after a 401', async () => {
    fake.failNext401 = true;
    await resetRateLimit();
    await drive.syncNow({ manual: true });
    expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalled();
    expect((await drive.getStatus()).lastError).toBeNull();
  });

  it('recreates a file whose cached ID was deleted (404)', async () => {
    const old = fake.byName('vaultsync-backup.enc')!;
    fake.files.delete(old.id);
    await vault.upsert('a.com', 'https', 'u', 'pw');
    await resetRateLimit();
    await drive.syncNow({ manual: true });
    expect(fake.byName('vaultsync-backup.enc')!.content).toBe(chromeMock.storage.local.dump().vault);
  });

  it('rate-limits automatic syncs to one per 10 seconds', async () => {
    await resetRateLimit();
    await drive.syncNow();
    const patches = () => fake.calls.filter((c) => c.method === 'PATCH').length;
    const before = patches();
    await vault.upsert('a.com', 'https', 'u', 'pw'); // schedules a debounced sync
    await drive.syncNow(); // too soon: must not hit the network
    expect(patches()).toBe(before);
  });

  it('records the error message when Drive fails', async () => {
    fake.fetch.mockImplementationOnce(async () => new Response('{"error":{"message":"quota"}}', { status: 403 }));
    await resetRateLimit();
    await expect(drive.syncNow({ manual: true })).rejects.toThrow(/403/);
    expect((await drive.getStatus()).lastError).toMatch(/quota/);
  });

  it('downloads the encrypted backup for restore', async () => {
    const blob = await drive.downloadBackup();
    expect(blob).toBe(chromeMock.storage.local.dump().vault);
  });

  it('disconnect clears the connection and revokes the token', async () => {
    const status = await drive.disconnect();
    expect(status.connected).toBe(false);
    expect(fake.calls.some((c) => c.url.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true);
  });
});
