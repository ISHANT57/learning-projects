// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import type { Settings } from './types';

/** chrome.storage.local keys (persistent, on disk). Never holds plaintext secrets. */
export const STORAGE = {
  VAULT: 'vault', // base64 encrypted blob
  SETTINGS: 'settings',
  SYNC_STATUS: 'syncStatus',
  DRIVE_FILES: 'driveFiles', // cached Drive file IDs
  PENDING_LOG: 'pendingLogEvents', // log rows waiting to be uploaded (no passwords)
  BACKUP_DIRTY: 'backupDirty', // vault changed since last Drive upload
  LAST_SYNC_ATTEMPT: 'lastSyncAttempt',
} as const;

/** chrome.storage.session keys (RAM only, wiped when the browser closes, trusted contexts only). */
export const SESSION = {
  KEY: 'sessionKey', // exported AES key while unlocked
  LAST_ACTIVITY: 'lastActivity',
  PENDING_CAPTURES: 'pendingCaptures',
  MULTI_STEP: 'multiStepUsernames',
  SAVE_OFFERS: 'saveOffers', // per-tab "Save password?" offers
} as const;

export const ALARMS = {
  AUTOLOCK: 'vaultsync-autolock',
  PERIODIC_SYNC: 'vaultsync-periodic-sync',
  DEBOUNCED_SYNC: 'vaultsync-debounced-sync',
} as const;

export const DRIVE = {
  API: 'https://www.googleapis.com/drive/v3/files',
  UPLOAD: 'https://www.googleapis.com/upload/drive/v3/files',
  REVOKE: 'https://oauth2.googleapis.com/revoke',
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  BACKUP_NAME: 'vaultsync-backup.enc',
  BACKUP_MIME: 'text/plain',
  LOG_NAME: 'vaultsync-activity-log.md',
  LOG_MIME: 'text/markdown',
  CLIENT_ID_PLACEHOLDER: '__GOOGLE_OAUTH_CLIENT_ID__',
} as const;

export const CRYPTO = {
  PBKDF2_ITERATIONS: 600_000,
  SALT_BYTES: 16,
  IV_BYTES: 12,
} as const;

export const LIMITS = {
  HISTORY_SIZE: 5,
  MIN_MASTER_LENGTH: 12,
  SYNC_DEBOUNCE_MS: 10_000,
  PERIODIC_SYNC_MINUTES: 30,
  AUTOLOCK_CHECK_MINUTES: 1,
  MULTI_STEP_TTL_MS: 5 * 60_000,
  FILL_DELAY_MS: 1_000,
  MAX_FIELD_LENGTH: 1_024,
  SAVE_OFFER_TTL_MS: 3 * 60_000,
} as const;

export const AUTOLOCK_CHOICES = [5, 15, 30, 60] as const;

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 15,
  autoFill: true,
  activityLog: true,
  askToSave: true,
};

export const OWNER = {
  CREDIT: 'Made by Ishant · © 2026 IMPS',
  FINGERPRINT: 'IMPS-VS-5FA22D0791658C41',
} as const;
