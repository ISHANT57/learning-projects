// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Small UI helpers shared by the popup and options pages.

import { LIMITS } from './constants';
import type { SyncStatus } from './types';

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return 'unknown';
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** 0-4 strength estimate for the master-password meter (length + character variety). */
export function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: `At least ${LIMITS.MIN_MASTER_LENGTH} characters. A long passphrase is best.` };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = 0;
  if (pw.length >= LIMITS.MIN_MASTER_LENGTH) score++;
  if (pw.length >= 16) score++;
  if (classes >= 3) score++;
  if (pw.length >= 20 || (pw.length >= 14 && classes === 4)) score++;
  if (pw.length < LIMITS.MIN_MASTER_LENGTH) score = 0;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] ?? 'Strong' };
}

export const STRENGTH_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];

/** Strong random password using the Web Crypto RNG (rejection sampling, no modulo bias). */
export function generatePassword(length = 20): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';
  const out: string[] = [];
  const limit = 256 - (256 % chars.length);
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(chars[b % chars.length]!);
    }
  }
  return out.join('');
}

/** Deterministic avatar colour for a host. */
export function avatarColor(host: string): string {
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 55% 45%)`;
}

export function syncSummary(sync: SyncStatus): { text: string; state: 'ok' | 'err' | 'off' } {
  if (!sync.configured) return { text: 'Google sync not set up for this build', state: 'off' };
  if (!sync.connected) return { text: 'Google Drive not connected', state: 'off' };
  if (sync.lastError) return { text: `Sync error: ${sync.lastError}`, state: 'err' };
  return { text: `${sync.email ?? 'Google'} · synced ${relativeTime(sync.lastSynced)}`, state: 'ok' };
}

export function friendlyError(err: unknown): string {
  const e = err as Error & { code?: string };
  if (e?.code === 'WrongPasswordError') return 'Wrong master password. Please try again.';
  if (e?.code === 'LockedError') return 'The vault is locked. Unlock it from the toolbar popup first.';
  return e?.message || 'Something went wrong.';
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(message: string, isError = false): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, isError ? 4500 : 2200);
}
