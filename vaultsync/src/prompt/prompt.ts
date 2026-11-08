// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// The "Save password?" prompt. Runs as an extension page inside an iframe on the web
// page, so the page cannot read it. It fetches the pending offer for its own tab from
// the background and reports the user's choice: Save (with edits), Never, or No thanks.

import { send } from '../shared/messages';
import { byId, friendlyError } from '../shared/ui';

const parentOrigin = '*'; // the parent is an arbitrary web page; we only send close/resize, no data

function post(type: 'vaultsync:close' | 'vaultsync:resize', extra: Record<string, unknown> = {}): void {
  window.parent.postMessage({ type, ...extra }, parentOrigin);
}

function resize(): void {
  post('vaultsync:resize', { height: Math.ceil(byId('card').getBoundingClientRect().height) + 2 });
}

function close(): void {
  post('vaultsync:close');
}

async function resolve(action: 'save' | 'never' | 'dismiss'): Promise<void> {
  const buttons = ['btn-save', 'btn-never', 'btn-dismiss'].map((id) => byId<HTMLButtonElement>(id));
  buttons.forEach((b) => (b.disabled = true));
  byId('error').textContent = '';
  try {
    const payload =
      action === 'save'
        ? { username: byId<HTMLInputElement>('username').value, password: byId<HTMLInputElement>('password').value }
        : {};
    const { result } = await send({ type: 'resolveSaveOffer', action, ...payload });
    if (action !== 'save') return close();
    byId('form').hidden = true;
    byId('done-text').textContent =
      result === 'updated' ? 'Password updated' : result === 'unchanged' ? 'Already saved' : 'Password saved';
    byId('done').hidden = false;
    resize();
    setTimeout(close, 1_400);
  } catch (err) {
    byId('error').textContent = friendlyError(err);
    buttons.forEach((b) => (b.disabled = false));
    resize();
  }
}

async function init(): Promise<void> {
  let offer;
  try {
    offer = await send({ type: 'getSaveOffer' });
  } catch {
    offer = null;
  }
  if (!offer) return close();

  byId('title').textContent = offer.kind === 'update' ? 'Update password?' : 'Save password?';
  byId('site').textContent = offer.host;
  byId<HTMLInputElement>('username').value = offer.username;
  byId<HTMLInputElement>('password').value = offer.password;
  byId('card').hidden = false;
  resize();

  byId('btn-eye').addEventListener('click', () => {
    const input = byId<HTMLInputElement>('password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    byId('eye-open').hidden = show;
    byId('eye-off').hidden = !show;
    byId('btn-eye').title = show ? 'Hide password' : 'Show password';
  });
  byId<HTMLFormElement>('form').addEventListener('submit', (e) => {
    e.preventDefault();
    void resolve('save');
  });
  byId('btn-never').addEventListener('click', () => void resolve('never'));
  byId('btn-dismiss').addEventListener('click', () => void resolve('dismiss'));
  byId('btn-close').addEventListener('click', () => void resolve('dismiss'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') void resolve('dismiss');
  });
  byId<HTMLButtonElement>('btn-save').focus();
}

void init();
