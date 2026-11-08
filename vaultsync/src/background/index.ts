// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Service-worker entry: message router, alarms, badge and notifications.
//
// SECURITY MODEL
//  - Content scripts live inside untrusted web pages. They may only send `capture`,
//    `rememberUsername` and `getFillData`. The site is ALWAYS taken from sender.url
//    (set by Chrome, cannot be forged by the page), never from the message body, and
//    auto-fill only ever returns credentials for that exact frame's own host.
//  - Everything else (listing, revealing, editing, exporting, settings) is accepted only
//    from this extension's own pages (popup/options), identified by their
//    chrome-extension://<id>/ URL.
//  - The service worker can be killed at any moment (MV3). All state lives in
//    chrome.storage; the unlocked key lives in chrome.storage.session (see session.ts),
//    so a restart either resumes the unlocked state or, if the session is gone, the
//    vault is simply locked.

import { ALARMS, LIMITS, SESSION } from '../shared/constants';
import {
  CONTENT_MESSAGE_TYPES,
  type ContentMessage,
  type Envelope,
  type PageMessage,
} from '../shared/messages';
import type { AppState, SaveOffer, SaveOfferView } from '../shared/types';
import { parseHostInput, siteFromUrl } from '../shared/url';
import * as drive from './drive';
import { getLastActivity, restrictSessionAccess } from './session';
import { getSettings, updateSettings } from './settings';
import * as vault from './vault';

// ----------------------------------------------------------------------------- startup

vault.onVaultChanged((events) => drive.recordVaultChange(events));

async function ensureAlarms(): Promise<void> {
  if (!(await chrome.alarms.get(ALARMS.AUTOLOCK))) {
    await chrome.alarms.create(ALARMS.AUTOLOCK, { periodInMinutes: LIMITS.AUTOLOCK_CHECK_MINUTES });
  }
  if (!(await chrome.alarms.get(ALARMS.PERIODIC_SYNC))) {
    await chrome.alarms.create(ALARMS.PERIODIC_SYNC, { periodInMinutes: LIMITS.PERIODIC_SYNC_MINUTES });
  }
}

async function startup(): Promise<void> {
  await restrictSessionAccess();
  await ensureAlarms();
  await updateBadge();
}

void startup();
chrome.runtime.onInstalled.addListener(() => void startup());
chrome.runtime.onStartup.addListener(() => void startup());

// ----------------------------------------------------------------------------- alarms

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case ALARMS.AUTOLOCK:
      void checkAutoLock();
      break;
    case ALARMS.PERIODIC_SYNC:
    case ALARMS.DEBOUNCED_SYNC:
      void drive.syncNow().catch(() => undefined);
      break;
  }
});

/** Locks the vault once it has been idle (no user actions) for the configured time. */
async function checkAutoLock(): Promise<void> {
  if (!(await vault.isUnlocked())) return;
  const last = (await getLastActivity()) ?? 0;
  const { autoLockMinutes } = await getSettings();
  if (Date.now() - last >= autoLockMinutes * 60_000) await vault.lock();
}

// ----------------------------------------------------------------------------- badge / notifications

async function updateBadge(): Promise<void> {
  const pending = await vault.pendingCaptureCount();
  await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  await chrome.action.setBadgeText({ text: pending ? String(pending) : '' });
}

function notify(title: string, message: string): void {
  // SECURITY: notifications only ever mention the site and username, never a password.
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 0,
    });
  } catch {
    /* notifications unavailable */
  }
}

// ----------------------------------------------------------------------------- multi-step logins

type MultiStepMap = Record<string, { username: string; at: number }>;

async function rememberUsername(host: string, username: string): Promise<void> {
  const result = await chrome.storage.session.get(SESSION.MULTI_STEP);
  const map = (result[SESSION.MULTI_STEP] as MultiStepMap | undefined) ?? {};
  const cutoff = Date.now() - LIMITS.MULTI_STEP_TTL_MS;
  for (const [h, v] of Object.entries(map)) if (v.at < cutoff) delete map[h];
  map[host] = { username, at: Date.now() };
  await chrome.storage.session.set({ [SESSION.MULTI_STEP]: map });
}

async function recallUsername(host: string): Promise<string | null> {
  const result = await chrome.storage.session.get(SESSION.MULTI_STEP);
  const entry = ((result[SESSION.MULTI_STEP] as MultiStepMap | undefined) ?? {})[host];
  if (!entry || entry.at < Date.now() - LIMITS.MULTI_STEP_TTL_MS) return null;
  return entry.username;
}

async function forgetUsername(host: string): Promise<void> {
  const result = await chrome.storage.session.get(SESSION.MULTI_STEP);
  const map = (result[SESSION.MULTI_STEP] as MultiStepMap | undefined) ?? {};
  if (map[host]) {
    delete map[host];
    await chrome.storage.session.set({ [SESSION.MULTI_STEP]: map });
  }
}

// ----------------------------------------------------------------------------- save prompt offers
//
// "Save password?" works like Chrome's: a captured login becomes an OFFER for that tab,
// kept in RAM-only session storage for a few minutes. The prompt (an extension-origin
// iframe the page cannot read) fetches the details from here and reports the decision.

type OfferMap = Record<string, SaveOffer>;

async function offers(): Promise<OfferMap> {
  const result = await chrome.storage.session.get(SESSION.SAVE_OFFERS);
  const map = (result[SESSION.SAVE_OFFERS] as OfferMap | undefined) ?? {};
  const cutoff = Date.now() - LIMITS.SAVE_OFFER_TTL_MS;
  for (const [tab, offer] of Object.entries(map)) if (offer.createdAt < cutoff) delete map[tab];
  return map;
}

async function getOffer(tabId: number | undefined): Promise<SaveOffer | null> {
  if (tabId === undefined) return null;
  return (await offers())[String(tabId)] ?? null;
}

async function setOffer(offer: SaveOffer): Promise<void> {
  const map = await offers();
  map[String(offer.tabId)] = offer;
  await chrome.storage.session.set({ [SESSION.SAVE_OFFERS]: map });
}

async function clearOffer(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  const map = await offers();
  delete map[String(tabId)];
  await chrome.storage.session.set({ [SESSION.SAVE_OFFERS]: map });
}

chrome.tabs.onRemoved.addListener((tabId) => void clearOffer(tabId));

function isPromptPage(sender: chrome.runtime.MessageSender): boolean {
  return typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL('src/prompt/prompt.html'));
}

// ----------------------------------------------------------------------------- messages

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(chrome.runtime.getURL(''))
  );
}

function text(value: unknown, max: number = LIMITS.MAX_FIELD_LENGTH): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  route(message, sender).then(
    (data) => sendResponse({ ok: true, data } satisfies Envelope<unknown>),
    (err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      sendResponse({ ok: false, error: e.message, code: e.name } satisfies Envelope<unknown>);
    },
  );
  return true; // keep the channel open for the async response
});

async function route(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (sender.id !== chrome.runtime.id) throw new Error('Unknown sender.');
  if (!message || typeof message !== 'object' || typeof (message as { type?: unknown }).type !== 'string') {
    throw new Error('Malformed message.');
  }
  const type = (message as { type: string }).type;
  if (isExtensionPage(sender)) return handlePage(message as PageMessage, sender);
  if (sender.tab && CONTENT_MESSAGE_TYPES.has(type)) return handleContent(message as ContentMessage, sender);
  throw new Error('This request is not allowed from here.');
}

async function handleContent(msg: ContentMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  // sender.url is the URL of the exact frame that sent the message (iframes included).
  const site = siteFromUrl(sender.url);

  switch (msg.type) {
    case 'getFillData': {
      if (!site) return { credentials: [] };
      const settings = await getSettings();
      if (!settings.autoFill || !(await vault.isUnlocked())) return { credentials: [] };
      return { credentials: await vault.credentialsForSite(site.host, site.scheme) };
    }

    case 'hasSaveOffer': {
      // Only the top frame shows the prompt, and it only learns "show it" - never the
      // username or password, which the prompt iframe fetches directly.
      if (sender.frameId !== 0) return { show: false };
      return { show: (await getOffer(sender.tab?.id)) !== null };
    }

    case 'rememberUsername': {
      const username = text(msg.username, 256);
      if (site && username) await rememberUsername(site.host, username);
      return null;
    }

    case 'capture': {
      if (!site || !(await vault.hasVault())) return { saved: 'ignored' };
      const password = typeof msg.password === 'string' ? msg.password : '';
      if (!password || password.length > LIMITS.MAX_FIELD_LENGTH) return { saved: 'ignored' };
      // Multi-step logins: the username was typed on an earlier page.
      const username = text(msg.username, 256) || (await recallUsername(site.host)) || '';

      if (await vault.isUnlocked()) {
        await forgetUsername(site.host);
        if (await vault.isNeverSave(site.host)) return { saved: 'ignored' }; // user chose "Never"
        const preview = await vault.previewUpsert(site.host, username, password);
        if (preview === 'unchanged') return { saved: 'unchanged' };

        const tabId = sender.tab?.id;
        if ((await getSettings()).askToSave && tabId !== undefined) {
          // Ask first, like Chrome. The top frame shows the prompt now (SPA / iframe
          // logins) or on the next page after a normal form navigation.
          await setOffer({
            tabId,
            host: site.host,
            scheme: site.scheme,
            username,
            password,
            kind: preview === 'new' ? 'new' : 'update',
            createdAt: Date.now(),
          });
          chrome.tabs.sendMessage(tabId, { type: 'showSavePrompt' }, { frameId: 0 }).catch(() => undefined);
          return { saved: 'offered' };
        }

        const { result } = await vault.upsert(site.host, site.scheme, username, password);
        if (result === 'new') notify('Login saved', `${username || 'Login'} on ${site.host} was saved to VaultSync.`);
        if (result === 'updated') notify('Password updated', `The password for ${username || 'your login'} on ${site.host} was updated.`);
        return { saved: result };
      }

      await vault.queuePendingCapture({
        host: site.host,
        scheme: site.scheme,
        username,
        password,
        capturedAt: new Date().toISOString(),
      });
      await forgetUsername(site.host);
      await updateBadge();
      notify('Unlock VaultSync to save', `Your ${site.host} login will be saved when you unlock VaultSync.`);
      return { saved: 'queued' };
    }
  }
  return null;
}

async function getState(): Promise<AppState> {
  return {
    hasVault: await vault.hasVault(),
    unlocked: await vault.isUnlocked(),
    pendingCaptures: await vault.pendingCaptureCount(),
    settings: await getSettings(),
    sync: await drive.getStatus(),
  };
}

function siteOrThrow(input: string) {
  const site = parseHostInput(text(input));
  if (!site) throw new vault.ValidationError('Enter a valid site, e.g. github.com');
  return site;
}

async function handlePage(msg: PageMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'getState':
      return getState();

    case 'createVault':
      await vault.createVault(msg.password);
      await drive.recordVaultChange([]);
      return null;

    case 'unlock': {
      await vault.unlock(msg.password);
      const processedCaptures = await vault.processPendingCaptures();
      await updateBadge();
      return { processedCaptures };
    }

    case 'lock':
      await vault.lock();
      return null;

    case 'listCredentials':
      return vault.listSummaries();

    case 'revealCredential':
      return vault.reveal(text(msg.id, 64));

    case 'addCredential': {
      const site = siteOrThrow(msg.host);
      return vault.upsert(site.host, site.scheme, msg.username, msg.password);
    }

    case 'updateCredential': {
      const site = siteOrThrow(msg.host);
      await vault.update(text(msg.id, 64), site.host, site.scheme, msg.username, msg.password);
      return null;
    }

    case 'deleteCredential':
      await vault.remove(text(msg.id, 64));
      return null;

    case 'syncNow':
      return drive.syncNow({ manual: true });

    case 'connectGoogle':
      return drive.connect();

    case 'disconnectGoogle':
      return drive.disconnect();

    case 'updateSettings':
      return updateSettings(msg.settings ?? {});

    case 'exportVault': {
      const file = await vault.exportVault();
      const date = file.exportedAt.slice(0, 10);
      return { fileName: `vaultsync-export-${date}.json`, json: JSON.stringify(file, null, 2) };
    }

    case 'importVault': {
      const count = await vault.importVault(String(msg.fileText ?? ''), String(msg.password ?? ''));
      await updateBadge();
      return { count };
    }

    case 'restoreFromDrive': {
      const blob = await drive.downloadBackup();
      await vault.replaceStoredBlobAndLock(blob);
      return null;
    }

    case 'getSaveOffer': {
      if (!isPromptPage(sender)) throw new Error('This request is not allowed from here.');
      const offer = await getOffer(sender.tab?.id);
      if (!offer) return null;
      const view: SaveOfferView = { host: offer.host, username: offer.username, password: offer.password, kind: offer.kind };
      return view;
    }

    case 'resolveSaveOffer': {
      if (!isPromptPage(sender)) throw new Error('This request is not allowed from here.');
      const tabId = sender.tab?.id;
      const offer = await getOffer(tabId);
      if (!offer) throw new vault.ValidationError('This save request has expired.');
      if (msg.action === 'dismiss') {
        await clearOffer(tabId);
        return { result: 'dismissed' };
      }
      if (msg.action === 'never') {
        await vault.addNeverSave(offer.host);
        await clearOffer(tabId);
        return { result: 'never' };
      }
      // Save, with whatever the user edited in the prompt.
      const username = typeof msg.username === 'string' ? text(msg.username, 256) : offer.username;
      const password = typeof msg.password === 'string' && msg.password ? msg.password : offer.password;
      const { result } = await vault.upsert(offer.host, offer.scheme, username, password);
      await clearOffer(tabId);
      return { result };
    }

    case 'listNeverSave':
      return vault.listNeverSave();

    case 'removeNeverSave':
      return vault.removeNeverSave(text(msg.host, 256));

    case 'clearAllData':
      await vault.lock();
      await drive.disconnect().catch(() => undefined);
      await chrome.storage.local.clear();
      await chrome.storage.session.clear();
      await updateBadge();
      return null;
  }
  throw new Error('Unknown request.');
}
