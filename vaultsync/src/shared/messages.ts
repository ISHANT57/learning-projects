// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import type {
  AppState,
  SaveOfferView,
  CredentialSecret,
  CredentialSummary,
  Settings,
  SyncStatus,
} from './types';

/**
 * Messages a content script may send. This is deliberately tiny: content scripts run
 * inside untrusted web pages, so they can only report a login and ask for credentials
 * for the page they are in. The background decides the site from sender.url, never
 * from anything in these messages.
 */
export type ContentMessage =
  | { type: 'capture'; username: string; password: string }
  | { type: 'rememberUsername'; username: string }
  | { type: 'getFillData' }
  | { type: 'hasSaveOffer' };

/** Messages only extension pages (popup, options) may send. */
export type PageMessage =
  | { type: 'getState' }
  | { type: 'createVault'; password: string }
  | { type: 'unlock'; password: string }
  | { type: 'lock' }
  | { type: 'listCredentials' }
  | { type: 'revealCredential'; id: string }
  | { type: 'addCredential'; host: string; username: string; password: string }
  | { type: 'updateCredential'; id: string; host: string; username: string; password: string }
  | { type: 'deleteCredential'; id: string }
  | { type: 'syncNow' }
  | { type: 'connectGoogle' }
  | { type: 'disconnectGoogle' }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'exportVault' }
  | { type: 'importVault'; fileText: string; password: string }
  | { type: 'restoreFromDrive' }
  | { type: 'clearAllData' }
  | { type: 'getSaveOffer' }
  | { type: 'resolveSaveOffer'; action: 'save' | 'never' | 'dismiss'; username?: string; password?: string }
  | { type: 'listNeverSave' }
  | { type: 'removeNeverSave'; host: string };

export type Message = ContentMessage | PageMessage;

export const CONTENT_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'capture',
  'rememberUsername',
  'getFillData',
  'hasSaveOffer',
]);

/** Response payloads per message type. */
export interface ResponseMap {
  capture: { saved: 'new' | 'updated' | 'unchanged' | 'queued' | 'ignored' | 'offered' };
  hasSaveOffer: { show: boolean };
  rememberUsername: null;
  getFillData: { credentials: Array<{ username: string; password: string }> };
  getState: AppState;
  createVault: null;
  unlock: { processedCaptures: number };
  lock: null;
  listCredentials: CredentialSummary[];
  revealCredential: CredentialSecret;
  addCredential: { id: string; result: 'new' | 'updated' | 'unchanged' };
  updateCredential: null;
  deleteCredential: null;
  syncNow: SyncStatus;
  connectGoogle: SyncStatus;
  disconnectGoogle: SyncStatus;
  updateSettings: Settings;
  exportVault: { fileName: string; json: string };
  importVault: { count: number };
  restoreFromDrive: null;
  clearAllData: null;
  getSaveOffer: SaveOfferView | null;
  resolveSaveOffer: { result: 'new' | 'updated' | 'unchanged' | 'never' | 'dismissed' };
  listNeverSave: string[];
  removeNeverSave: string[];
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Typed request helper for extension pages. Throws with the background's error message. */
export async function send<M extends Message>(message: M): Promise<ResponseMap[M['type']]> {
  const res = (await chrome.runtime.sendMessage(message)) as Envelope<ResponseMap[M['type']]> | undefined;
  if (!res) throw new Error('No response from VaultSync background');
  if (!res.ok) {
    const err = new Error(res.error);
    (err as Error & { code?: string }).code = res.code;
    throw err;
  }
  return res.data;
}
