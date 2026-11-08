// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Minimal in-memory fake of the chrome.* APIs used by the background code.
import { vi } from 'vitest';

type Data = Record<string, unknown>;

function storageArea() {
  let data: Data = {};
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    async get(keys?: string | string[] | Data | null): Promise<Data> {
      if (keys == null) return clone(data);
      if (typeof keys === 'string') return keys in data ? { [keys]: clone(data[keys]) } : {};
      if (Array.isArray(keys)) {
        const out: Data = {};
        for (const k of keys) if (k in data) out[k] = clone(data[k]);
        return out;
      }
      const out: Data = {};
      for (const [k, def] of Object.entries(keys)) out[k] = k in data ? clone(data[k]) : def;
      return out;
    },
    async set(items: Data): Promise<void> {
      data = { ...data, ...clone(items) };
    },
    async remove(keys: string | string[]): Promise<void> {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
    async clear(): Promise<void> {
      data = {};
    },
    async setAccessLevel(): Promise<void> {},
    /** test helper: raw contents */
    dump: () => data,
  };
}

export interface ChromeMock {
  storage: { local: ReturnType<typeof storageArea>; session: ReturnType<typeof storageArea> };
  identity: {
    getAuthToken: ReturnType<typeof vi.fn>;
    removeCachedAuthToken: ReturnType<typeof vi.fn>;
    getProfileUserInfo: ReturnType<typeof vi.fn>;
  };
  [key: string]: unknown;
}

export function installChromeMock(opts: { clientId?: string } = {}): ChromeMock {
  const alarms = new Map<string, unknown>();
  let tokenCounter = 0;
  const mock = {
    runtime: {
      id: 'testextensionid',
      getURL: (p: string) => `chrome-extension://testextensionid/${p}`,
      getManifest: () => ({
        manifest_version: 3,
        name: 'VaultSync',
        version: '1.0.0',
        oauth2: { client_id: opts.clientId ?? '123-test.apps.googleusercontent.com', scopes: [] },
      }),
      sendMessage: vi.fn(async () => ({ ok: true, data: null })),
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      openOptionsPage: vi.fn(),
    },
    storage: { local: storageArea(), session: storageArea() },
    alarms: {
      create: vi.fn(async (name: string, info: unknown) => void alarms.set(name, info)),
      get: vi.fn(async (name: string) => (alarms.has(name) ? { name } : undefined)),
      clear: vi.fn(async (name: string) => alarms.delete(name)),
      onAlarm: { addListener: vi.fn() },
    },
    identity: {
      getAuthToken: vi.fn(async () => ({ token: `token-${++tokenCounter}` })),
      removeCachedAuthToken: vi.fn(async () => undefined),
      getProfileUserInfo: vi.fn(async () => ({ email: 'user@gmail.com', id: '1' })),
    },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    },
    notifications: { create: vi.fn() },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = mock;
  return mock as unknown as ChromeMock;
}
