// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock, type ChromeMock } from './chromeMock';

const MASTER = 'my master password 1';
const SECRET = 'GitHub#Secret-123';

let chromeMock: ChromeMock;
let vault: typeof import('../../src/background/vault');
let session: typeof import('../../src/background/session');
let crypto_: typeof import('../../src/background/crypto');

beforeEach(async () => {
  vi.resetModules();
  chromeMock = installChromeMock();
  vault = await import('../../src/background/vault');
  session = await import('../../src/background/session');
  crypto_ = await import('../../src/background/crypto');
});

function decodedStorage(): string {
  const blob = chromeMock.storage.local.dump().vault as string;
  return new TextDecoder().decode(crypto_.fromBase64(blob));
}

describe('vault lifecycle', () => {
  it('first run: no vault until a master password is created', async () => {
    expect(await vault.hasVault()).toBe(false);
    await expect(vault.createVault('short')).rejects.toThrow(/at least 12/);
    await vault.createVault(MASTER);
    expect(await vault.hasVault()).toBe(true);
    expect(await vault.isUnlocked()).toBe(true);
    await expect(vault.createVault(MASTER)).rejects.toThrow(/already exists/);
  });

  it('never stores the master password or any plaintext password', async () => {
    await vault.createVault(MASTER);
    await vault.upsert('github.com', 'https', 'john', SECRET);
    const allLocal = JSON.stringify(chromeMock.storage.local.dump()) + decodedStorage();
    const allSession = JSON.stringify(chromeMock.storage.session.dump());
    for (const haystack of [allLocal, allSession]) {
      expect(haystack).not.toContain(SECRET);
      expect(haystack).not.toContain(MASTER);
    }
  });

  it('lock wipes the key and blocks access; unlock restores it', async () => {
    await vault.createVault(MASTER);
    await vault.upsert('github.com', 'https', 'john', SECRET);
    await vault.lock();
    expect(await vault.isUnlocked()).toBe(false);
    expect(chromeMock.storage.session.dump().sessionKey).toBeUndefined();
    await expect(vault.listSummaries()).rejects.toBeInstanceOf(vault.LockedError);
    await expect(vault.unlock('wrong password!!')).rejects.toBeInstanceOf(crypto_.WrongPasswordError);
    await vault.unlock(MASTER);
    expect((await vault.listSummaries()).map((c) => c.host)).toEqual(['github.com']);
  });

  it('survives a service-worker restart while unlocked (session key)', async () => {
    await vault.createVault(MASTER);
    await vault.upsert('github.com', 'https', 'john', SECRET);
    session.simulateWorkerRestart();
    vault.dropMemoryVault();
    expect(await vault.isUnlocked()).toBe(true);
    expect((await vault.reveal((await vault.listSummaries())[0]!.id)).password).toBe(SECRET);
  });

  it('is locked after a browser restart (session storage wiped)', async () => {
    await vault.createVault(MASTER);
    await chromeMock.storage.session.clear();
    session.simulateWorkerRestart();
    vault.dropMemoryVault();
    expect(await vault.isUnlocked()).toBe(false);
  });
});

describe('credentials', () => {
  beforeEach(async () => {
    await vault.createVault(MASTER);
  });

  it('de-duplicates by host + username and keeps password history', async () => {
    expect((await vault.upsert('github.com', 'https', 'john', 'pw-1')).result).toBe('new');
    expect((await vault.upsert('github.com', 'https', 'JOHN', 'pw-1')).result).toBe('unchanged');
    expect((await vault.upsert('github.com', 'https', 'john', 'pw-2')).result).toBe('updated');
    const list = await vault.listSummaries();
    expect(list).toHaveLength(1);
    const secret = await vault.reveal(list[0]!.id);
    expect(secret.password).toBe('pw-2');
    expect(secret.history.map((h) => h.password)).toEqual(['pw-1']);
  });

  it('caps password history at 5 entries', async () => {
    for (let i = 0; i <= 7; i++) await vault.upsert('a.com', 'https', 'u', `pw-${i}`);
    const secret = await vault.reveal((await vault.listSummaries())[0]!.id);
    expect(secret.password).toBe('pw-7');
    expect(secret.history.map((h) => h.password)).toEqual(['pw-6', 'pw-5', 'pw-4', 'pw-3', 'pw-2']);
  });

  it('list summaries never include passwords', async () => {
    await vault.upsert('a.com', 'https', 'u', SECRET);
    expect(JSON.stringify(await vault.listSummaries())).not.toContain(SECRET);
  });

  it('never offers https logins to http pages', async () => {
    await vault.upsert('site.com', 'https', 'u', 'secure-pw');
    expect(await vault.credentialsForSite('site.com', 'https')).toHaveLength(1);
    expect(await vault.credentialsForSite('site.com', 'http')).toHaveLength(0);
    expect(await vault.credentialsForSite('other.com', 'https')).toHaveLength(0);
  });

  it('emits change events without passwords', async () => {
    const events: unknown[] = [];
    vault.onVaultChanged((e) => void events.push(...e));
    await vault.upsert('a.com', 'https', 'u', SECRET);
    await vault.upsert('a.com', 'https', 'u', SECRET + '2');
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    expect(events.map((e) => (e as { action: string }).action)).toEqual(['new', 'updated']);
  });

  it('edit refuses to create a duplicate', async () => {
    const a = await vault.upsert('a.com', 'https', 'one', 'p1');
    await vault.upsert('a.com', 'https', 'two', 'p2');
    await expect(vault.update(a.id, 'a.com', 'https', 'two', 'p1')).rejects.toThrow(/already exists/);
  });
});

describe('save prompt helpers', () => {
  beforeEach(async () => {
    await vault.createVault(MASTER);
  });

  it('previews what saving would do without changing the vault', async () => {
    expect(await vault.previewUpsert('a.com', 'u', 'pw')).toBe('new');
    expect(await vault.listSummaries()).toHaveLength(0);
    await vault.upsert('a.com', 'https', 'u', 'pw');
    expect(await vault.previewUpsert('a.com', 'U', 'pw')).toBe('unchanged');
    expect(await vault.previewUpsert('a.com', 'u', 'pw2')).toBe('updated');
  });

  it('keeps the "Never" list inside the encrypted vault', async () => {
    await vault.addNeverSave('private-site.com');
    expect(await vault.isNeverSave('private-site.com')).toBe(true);
    expect(await vault.listNeverSave()).toEqual(['private-site.com']);
    expect(JSON.stringify(chromeMock.storage.local.dump()) + decodedStorage()).not.toContain('private-site.com');
    expect(await vault.removeNeverSave('private-site.com')).toEqual([]);
    expect(await vault.isNeverSave('private-site.com')).toBe(false);
  });
});

describe('locked captures', () => {
  it('queues captures while locked and saves them on unlock', async () => {
    await vault.createVault(MASTER);
    await vault.lock();
    await vault.queuePendingCapture({ host: 'x.com', scheme: 'https', username: 'me', password: 'pw', capturedAt: '' });
    expect(await vault.pendingCaptureCount()).toBe(1);
    // queued in RAM-only session storage, not on disk
    expect(JSON.stringify(chromeMock.storage.local.dump())).not.toContain('x.com');
    await vault.unlock(MASTER);
    expect(await vault.processPendingCaptures()).toBe(1);
    expect(await vault.pendingCaptureCount()).toBe(0);
    expect((await vault.listSummaries())[0]!.host).toBe('x.com');
  });
});

describe('export / import', () => {
  it('round-trips an encrypted export and requires its master password', async () => {
    await vault.createVault(MASTER);
    await vault.upsert('a.com', 'https', 'u', SECRET);
    const file = await vault.exportVault();
    expect(JSON.stringify(file)).not.toContain(SECRET);
    await chromeMock.storage.local.clear();
    await vault.lock();
    await expect(vault.importVault(JSON.stringify(file), 'wrong password!!')).rejects.toBeInstanceOf(
      crypto_.WrongPasswordError,
    );
    expect(await vault.importVault(JSON.stringify(file), MASTER)).toBe(1);
    expect(await vault.isUnlocked()).toBe(true);
    await expect(vault.importVault('{"nope":1}', MASTER)).rejects.toThrow(/not a VaultSync export/);
  });
});
