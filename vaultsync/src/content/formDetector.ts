// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Detects login forms and captures credentials when the user submits them.
// Runs in every frame (all_frames) of every http(s) page, in the isolated world.
//
// SECURITY: this script never sees the vault or the key. It only sends what the user
// just typed to the background via chrome.runtime.sendMessage; the background decides
// which site it belongs to from sender.url.

import type { ContentMessage } from '../shared/messages';
import {
  containerFor,
  findStandaloneUsernameField,
  findUsernameField,
  isSubmitLike,
  pickPasswordField,
  safeSend,
} from './dom';

const DEDUPE_MS = 4_000;
let lastSent = { key: '', at: 0 };
const watchedForms = new WeakSet<HTMLFormElement>();

function send(message: ContentMessage): void {
  void safeSend(message);
}

/** Captures from a form-like container: a password login, or step 1 of a multi-step login. */
export function captureFrom(container: ParentNode): void {
  const passwords = Array.from(container.querySelectorAll('input[type="password"]')).filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement && !el.disabled,
  );
  const password = pickPasswordField(passwords);

  if (password) {
    const usernameField = findUsernameField(password, () => true);
    const username = usernameField?.value.trim() ?? '';
    const key = `${username}\u0000${password.value}`;
    if (key === lastSent.key && Date.now() - lastSent.at < DEDUPE_MS) return; // click + submit
    lastSent = { key, at: Date.now() };
    send({ type: 'capture', username, password: password.value });
    return;
  }

  // No password yet: probably "enter your email -> Next". Remember it for the next page.
  if (passwords.length === 0) {
    const userField = findStandaloneUsernameField(container, () => true);
    const username = userField?.value.trim();
    if (username) send({ type: 'rememberUsername', username });
  }
}

function onSubmit(event: Event): void {
  if (event.target instanceof HTMLFormElement) captureFrom(event.target);
}

function onClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest('button, input[type="submit"], input[type="button"], input[type="image"], [role="button"]');
  if (!button || !isSubmitLike(button)) return;
  captureFrom(containerFor(button as HTMLElement));
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;
  const target = event.target;
  if (target instanceof HTMLInputElement && (target.type === 'password' || target.form === null)) {
    captureFrom(containerFor(target));
  }
}

/** Belt and braces: listen on each form directly too (some sites stop propagation). */
function watchForms(root: ParentNode): void {
  root.querySelectorAll('form').forEach((form) => {
    if (watchedForms.has(form)) return;
    watchedForms.add(form);
    form.addEventListener('submit', onSubmit, true);
  });
}

function init(): void {
  // Capture phase on the document sees submits/clicks even from forms added later.
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  watchForms(document);

  // SPAs render login forms after load; watch for them (debounced).
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      watchForms(document);
      window.dispatchEvent(new CustomEvent('vaultsync:dom-changed'));
    }, 300);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) init();
