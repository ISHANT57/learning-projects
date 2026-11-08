// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// DOM helpers shared by the form detector and auto-fill. Pure functions over the page's
// DOM - no access to the vault, the key or any storage.

export type VisibilityCheck = (el: HTMLElement) => boolean;

const USERNAME_HINT = /user|e-?mail|login|account|identifier|phone|mobile|member|customer/i;
const NOT_USERNAME = /search|query|captcha|otp|code|coupon|promo|zip|postal|city|address/i;
const SUBMIT_TEXT = /^(log ?in|sign ?in|continue|next|submit|enter|go|proceed|verify)\b/i;
const USERNAME_TYPES = new Set(['text', 'email', 'tel', '']);

/** True if the element is rendered and takes up space (hidden honeypots are skipped). */
export const isVisible: VisibilityCheck = (el) => {
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
};

export function isPasswordField(el: Element | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === 'password' && !el.disabled;
}

export function findPasswordFields(root: ParentNode = document, visible: VisibilityCheck = isVisible): HTMLInputElement[] {
  return Array.from(root.querySelectorAll('input[type="password"]')).filter(
    (el): el is HTMLInputElement => isPasswordField(el) && visible(el),
  );
}

function attrText(el: HTMLInputElement): string {
  return [el.name, el.id, el.placeholder, el.getAttribute('aria-label') ?? '', el.autocomplete]
    .join(' ')
    .toLowerCase();
}

export function isUsernameCandidate(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return false;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (!USERNAME_TYPES.has(type)) return false;
  return !NOT_USERNAME.test(attrText(el));
}

function rank(el: HTMLInputElement): number {
  const ac = (el.autocomplete || '').toLowerCase();
  if (ac.includes('username') || ac === 'email') return 0;
  if ((el.getAttribute('type') ?? '').toLowerCase() === 'email') return 1;
  if (USERNAME_HINT.test(attrText(el))) return 2;
  return 3;
}

/** A sensible "form-like" container for a field: its <form>, or a nearby ancestor. */
export function containerFor(el: HTMLElement): ParentNode {
  if (el instanceof HTMLInputElement && el.form) return el.form;
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const inputs = node.querySelectorAll('input');
    if (inputs.length > 1 || node.querySelector('button, input[type="submit"]')) return node;
  }
  return el.ownerDocument.body ?? el.ownerDocument;
}

/**
 * Finds the username/email field that belongs to a password field. Strategy, in order:
 *  1. autocomplete="username"/"email"   2. type="email"
 *  3. name/id/placeholder/aria-label hints   4. nearest visible text input before it.
 * Only inputs located BEFORE the password field (in document order) are considered.
 */
export function findUsernameField(
  password: HTMLInputElement,
  visible: VisibilityCheck = isVisible,
): HTMLInputElement | null {
  const container = containerFor(password);
  const candidates = Array.from(container.querySelectorAll('input')).filter(
    (el): el is HTMLInputElement =>
      isUsernameCandidate(el) &&
      visible(el) &&
      Boolean(el.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  if (!candidates.length) return null;
  const best = Math.min(...candidates.map(rank));
  const ranked = candidates.filter((c) => rank(c) === best);
  // Among equals, the one closest to (i.e. last before) the password field wins.
  return ranked[ranked.length - 1] ?? null;
}

/** Username field on a page with no password field (step 1 of a multi-step login). */
export function findStandaloneUsernameField(
  root: ParentNode = document,
  visible: VisibilityCheck = isVisible,
): HTMLInputElement | null {
  const candidates = Array.from(root.querySelectorAll('input')).filter(
    (el): el is HTMLInputElement => isUsernameCandidate(el) && visible(el) && rank(el) <= 2,
  );
  if (!candidates.length) return null;
  return candidates.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/**
 * Chooses which password to save when a form has several password fields:
 *  - 3+ filled (current / new / confirm)  -> the new one (2nd)
 *  - 2 filled and equal (password / confirm) -> that password
 *  - 2 filled and different (current / new) -> the new one
 *  - otherwise the first filled one.
 */
export function pickPasswordField(fields: HTMLInputElement[]): HTMLInputElement | null {
  const filled = fields.filter((f) => f.value.length > 0);
  if (filled.length >= 3) return filled[1] ?? null;
  if (filled.length === 2) return filled[0]!.value === filled[1]!.value ? filled[0]! : filled[1]!;
  return filled[0] ?? null;
}

/**
 * Is this click a "submit the login" click? Only an EXPLICIT type="submit" or a button
 * labelled like "Log in / Sign in / Next". A <button> without a type attribute defaults to
 * submit, but icons such as "show password" are often such buttons - treating them as
 * submit would save a half-typed password, so they need a matching label. Real form
 * submissions are caught separately by the submit event.
 */
export function isSubmitLike(el: Element): boolean {
  const explicitType = (el.getAttribute('type') ?? '').toLowerCase();
  if (el instanceof HTMLInputElement) {
    if (explicitType === 'submit') return true;
    if (explicitType === 'button' || explicitType === 'image') return SUBMIT_TEXT.test(el.value || el.alt || '');
    return false;
  }
  if (explicitType === 'submit') return true;
  const label = (el.textContent || el.getAttribute('aria-label') || '').trim();
  return SUBMIT_TEXT.test(label);
}

/**
 * Sets an input's value so that React/Angular/Vue notice it. Frameworks track the value
 * through their own property hooks; calling the native HTMLInputElement setter directly
 * and then dispatching input/change makes their change detection fire.
 */
export function setNativeValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** sendMessage that never throws (e.g. after the extension was reloaded). */
export async function safeSend<T>(message: unknown): Promise<T | null> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as { ok: boolean; data?: T } | undefined;
    return res?.ok ? (res.data as T) : null;
  } catch {
    return null;
  }
}
