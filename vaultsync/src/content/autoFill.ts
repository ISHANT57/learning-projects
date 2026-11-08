// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Auto-fills saved credentials into login forms.
//
// SECURITY:
//  - The background only answers with credentials for THIS frame's own host (taken from
//    sender.url) and only when unlocked + auto-fill enabled. A page cannot ask for
//    another site's password, and a cross-origin iframe only gets its own site's logins.
//  - Only visible fields are filled, so invisible "honeypot" fields cannot harvest data.
//  - Forms with more than one password field (sign-up / change password) are skipped.
//  - A field the user has already typed in is never overwritten.

import { LIMITS } from '../shared/constants';
import { findPasswordFields, findStandaloneUsernameField, findUsernameField, safeSend, setNativeValue } from './dom';

type FillCredential = { username: string; password: string };

const typedByUser = new WeakSet<HTMLInputElement>();
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function choose(credentials: FillCredential[], usernameField: HTMLInputElement | null): FillCredential | null {
  if (!credentials.length) return null;
  const typed = usernameField?.value.trim().toLowerCase();
  if (typed) return credentials.find((c) => c.username.toLowerCase() === typed) ?? null;
  return credentials[0] ?? null; // most recently updated first
}

function canFill(el: HTMLInputElement): boolean {
  return !typedByUser.has(el) && !el.disabled && !el.readOnly && el.value === '';
}

export async function attemptFill(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const passwords = findPasswordFields();
    const standaloneUser = passwords.length ? null : findStandaloneUsernameField();
    if (!passwords.length && !standaloneUser) return;

    const response = await safeSend<{ credentials: FillCredential[] }>({ type: 'getFillData' });
    const credentials = response?.credentials ?? [];
    if (!credentials.length) return;

    if (!passwords.length && standaloneUser) {
      // Multi-step login, step 1: only pre-fill the username when it is unambiguous.
      if (credentials.length === 1 && canFill(standaloneUser)) setNativeValue(standaloneUser, credentials[0]!.username);
      return;
    }

    for (const password of passwords) {
      if (password.autocomplete === 'new-password') continue;
      const form = password.form ?? password.closest('form');
      if (form && findPasswordFields(form).length > 1) continue; // sign-up / change-password form
      const usernameField = findUsernameField(password);
      const credential = choose(credentials, usernameField);
      if (!credential) continue;
      if (usernameField && credential.username && canFill(usernameField)) {
        setNativeValue(usernameField, credential.username);
      }
      if (canFill(password)) setNativeValue(password, credential.password);
    }
  } finally {
    running = false;
  }
}

function schedule(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void attemptFill();
  }, delay);
}

function init(): void {
  // Remember fields the user typed in themselves (trusted events only).
  document.addEventListener(
    'input',
    (e) => {
      if (e.isTrusted && e.target instanceof HTMLInputElement) typedByUser.add(e.target);
    },
    true,
  );

  // Initial attempt: wait a moment so SPAs have rendered their login form.
  if (document.readyState === 'complete') schedule(LIMITS.FILL_DELAY_MS);
  else window.addEventListener('load', () => schedule(LIMITS.FILL_DELAY_MS), { once: true });

  // SPA navigation: spaHooks.ts (main world) announces pushState/replaceState/popstate.
  window.addEventListener('vaultsync:navigate', () => schedule(LIMITS.FILL_DELAY_MS));
  window.addEventListener('popstate', () => schedule(LIMITS.FILL_DELAY_MS));
  // New fields rendered later (MutationObserver in formDetector.ts).
  window.addEventListener('vaultsync:dom-changed', () => schedule(250));

  // Fallback for routers we could not hook: notice URL changes.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      schedule(LIMITS.FILL_DELAY_MS);
    }
  }, 1_000);
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) init();
