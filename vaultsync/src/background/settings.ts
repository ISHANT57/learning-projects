// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import { AUTOLOCK_CHOICES, DEFAULT_SETTINGS, STORAGE } from '../shared/constants';
import type { Settings } from '../shared/types';

function sanitize(raw: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && (AUTOLOCK_CHOICES as readonly number[]).includes(raw.autoLockMinutes as number)) {
    s.autoLockMinutes = raw.autoLockMinutes as number;
  }
  if (typeof raw?.autoFill === 'boolean') s.autoFill = raw.autoFill;
  if (typeof raw?.activityLog === 'boolean') s.activityLog = raw.activityLog;
  return s;
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE.SETTINGS);
  return sanitize(result[STORAGE.SETTINGS] as Partial<Settings> | undefined);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  if (patch.autoLockMinutes !== undefined &&
      !(AUTOLOCK_CHOICES as readonly number[]).includes(patch.autoLockMinutes)) {
    throw new Error(`Auto-lock must be one of ${AUTOLOCK_CHOICES.join(', ')} minutes.`);
  }
  const next = sanitize({ ...current, ...patch });
  await chrome.storage.local.set({ [STORAGE.SETTINGS]: next });
  if (!next.activityLog) {
    // Logging switched off: drop any rows that were still waiting to be uploaded.
    await chrome.storage.local.remove(STORAGE.PENDING_LOG);
  }
  return next;
}
