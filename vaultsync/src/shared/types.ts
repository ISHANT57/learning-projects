// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.

/** A previous password kept so an accidental auto-update can be undone. */
export interface PasswordHistoryEntry {
  password: string;
  changedAt: string; // ISO timestamp when this password was replaced
}

/** One saved login. Only ever exists decrypted inside the background worker. */
export interface Credential {
  id: string;
  host: string; // normalised hostname, e.g. "github.com" (www. stripped)
  scheme: 'https' | 'http'; // scheme the login was saved on; https logins never fill on http pages
  username: string;
  password: string;
  createdAt: string;
  updatedAt: string;
  history: PasswordHistoryEntry[];
}

/** The decrypted vault. Serialised to JSON, then encrypted as a whole. */
export interface Vault {
  version: 1;
  credentials: Credential[];
  /** Sites the user chose "Never" for. Kept inside the encrypted vault (private). */
  neverSave?: string[];
}

/** What the popup list receives - never includes passwords. */
export interface CredentialSummary {
  id: string;
  host: string;
  username: string;
  updatedAt: string;
}

/** Password + history, returned only to extension pages on explicit "reveal". */
export interface CredentialSecret {
  id: string;
  host: string;
  scheme: 'https' | 'http';
  username: string;
  password: string;
  history: PasswordHistoryEntry[];
}

/**
 * The encrypted vault envelope. Everything needed to re-derive the key except the
 * master password itself. Stored as base64(JSON(EncryptedBlob)).
 */
export interface EncryptedBlob {
  v: 1;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string };
  cipher: 'AES-256-GCM';
  iv: string; // base64, 12 random bytes, unique per encryption
  ct: string; // base64 ciphertext incl. 16-byte GCM auth tag
}

export interface Settings {
  autoLockMinutes: number;
  autoFill: boolean;
  activityLog: boolean;
  /** Show a "Save password?" prompt instead of saving silently. */
  askToSave: boolean;
}

export interface SyncStatus {
  configured: boolean; // an OAuth client ID is present in the manifest
  connected: boolean; // the user connected a Google account
  email: string | null;
  lastSynced: string | null;
  lastError: string | null;
}

export type LogAction = 'new' | 'updated';

/** One activity-log row. By design there is no password field. */
export interface LogEvent {
  timestamp: string;
  host: string;
  username: string;
  action: LogAction;
}

/** A credential captured while the vault was locked (kept only in RAM session storage). */
export interface PendingCapture {
  host: string;
  scheme: 'https' | 'http';
  username: string;
  password: string;
  capturedAt: string;
}

/** Encrypted export file format. */
export interface ExportFile {
  format: 'vaultsync-export';
  version: 1;
  exportedAt: string;
  vault: string; // the same base64 encrypted blob that lives in storage
}

export interface AppState {
  hasVault: boolean;
  unlocked: boolean;
  pendingCaptures: number;
  settings: Settings;
  sync: SyncStatus;
}

export type UpsertResult = 'new' | 'updated' | 'unchanged';

/** A captured login waiting for the user's decision in the save prompt (RAM only). */
export interface SaveOffer {
  tabId: number;
  host: string;
  scheme: 'https' | 'http';
  username: string;
  password: string;
  kind: 'new' | 'update';
  createdAt: number;
}

/** What the prompt iframe receives. */
export interface SaveOfferView {
  host: string;
  username: string;
  password: string;
  kind: 'new' | 'update';
}
