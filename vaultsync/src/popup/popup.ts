// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Toolbar popup. Talks to the background only through typed messages; it never holds
// the key. Revealed passwords live in this page only while it is open. All user data is
// rendered with textContent (never innerHTML), so site names cannot inject HTML.

import { LIMITS, OWNER } from '../shared/constants';
import { send } from '../shared/messages';
import type { AppState, CredentialSecret, CredentialSummary } from '../shared/types';
import { siteFromUrl } from '../shared/url';
import {
  STRENGTH_COLORS,
  avatarColor,
  byId,
  friendlyError,
  generatePassword,
  passwordStrength,
  relativeTime,
  syncSummary,
  toast,
} from '../shared/ui';

type ViewName = 'loading' | 'setup' | 'locked' | 'list' | 'detail' | 'form';
const VIEWS: ViewName[] = ['loading', 'setup', 'locked', 'list', 'detail', 'form'];

let state: AppState | null = null;
let credentials: CredentialSummary[] = [];
let current: CredentialSecret | null = null;
let editingId: string | null = null;

// ----------------------------------------------------------------------------- views

function show(view: ViewName): void {
  for (const v of VIEWS) byId(`view-${v}`).hidden = v !== view;
  byId('top-actions').hidden = !(state?.unlocked && ['list', 'detail', 'form'].includes(view));
  if (view !== 'detail') current = null; // drop revealed secret when leaving the detail view
}

function renderFooter(): void {
  if (!state) return;
  const el = byId('sync-status');
  el.replaceChildren();
  const { text, state: kind } = syncSummary(state.sync);
  const dot = document.createElement('span');
  dot.className = `dot ${kind}`;
  const label = document.createElement('span');
  label.textContent = text;
  el.append(dot, label);
  if (!state.sync.connected) {
    const link = document.createElement('button');
    link.className = 'link small';
    link.textContent = state.sync.configured ? 'Connect' : 'How?';
    link.addEventListener('click', () => void chrome.runtime.openOptionsPage());
    el.append(link);
  }
  byId('credit').textContent = OWNER.CREDIT;
}

async function refresh(): Promise<void> {
  try {
    state = await send({ type: 'getState' });
  } catch (err) {
    toast(friendlyError(err), true);
    return;
  }
  renderFooter();
  if (!state.hasVault) {
    show('setup');
    byId<HTMLInputElement>('setup-password').focus();
  } else if (!state.unlocked) {
    const pending = byId('locked-pending');
    pending.hidden = state.pendingCaptures === 0;
    pending.textContent = `${state.pendingCaptures} captured login(s) will be saved when you unlock.`;
    show('locked');
    byId<HTMLInputElement>('unlock-password').focus();
  } else {
    await loadList();
  }
}

// ----------------------------------------------------------------------------- setup

function bindSetup(): void {
  const pw = byId<HTMLInputElement>('setup-password');
  const confirm = byId<HTMLInputElement>('setup-confirm');
  const meter = byId('setup-meter');
  const strength = byId('setup-strength');
  const error = byId('setup-error');

  pw.addEventListener('input', () => {
    const { score, label } = passwordStrength(pw.value);
    meter.style.width = `${pw.value ? Math.max(score, 0.5) * 25 : 0}%`;
    meter.style.background = STRENGTH_COLORS[score] ?? STRENGTH_COLORS[0]!;
    strength.textContent = pw.value ? `Strength: ${label}` : label;
  });

  byId<HTMLFormElement>('form-setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (pw.value.length < LIMITS.MIN_MASTER_LENGTH) {
      error.textContent = `Use at least ${LIMITS.MIN_MASTER_LENGTH} characters.`;
      return;
    }
    if (pw.value !== confirm.value) {
      error.textContent = 'The two passwords do not match.';
      return;
    }
    const button = byId<HTMLButtonElement>('setup-submit');
    button.disabled = true;
    button.textContent = 'Creating vault…';
    try {
      await send({ type: 'createVault', password: pw.value });
      pw.value = '';
      confirm.value = '';
      toast('Vault created');
      await refresh();
    } catch (err) {
      error.textContent = friendlyError(err);
    } finally {
      button.disabled = false;
      button.textContent = 'Create vault';
    }
  });
}

// ----------------------------------------------------------------------------- unlock

function bindUnlock(): void {
  const pw = byId<HTMLInputElement>('unlock-password');
  const error = byId('unlock-error');
  byId<HTMLFormElement>('form-unlock').addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (!pw.value) {
      error.textContent = 'Enter your master password.';
      return;
    }
    const button = byId<HTMLButtonElement>('unlock-submit');
    button.disabled = true;
    button.textContent = 'Unlocking…';
    try {
      const { processedCaptures } = await send({ type: 'unlock', password: pw.value });
      pw.value = '';
      if (processedCaptures) toast(`Saved ${processedCaptures} login(s) captured while locked`);
      await refresh();
    } catch (err) {
      error.textContent = friendlyError(err);
      pw.select();
    } finally {
      button.disabled = false;
      button.textContent = 'Unlock';
    }
  });
}

// ----------------------------------------------------------------------------- list

async function loadList(): Promise<void> {
  try {
    credentials = await send({ type: 'listCredentials' });
  } catch (err) {
    if ((err as { code?: string }).code === 'LockedError') return refresh();
    toast(friendlyError(err), true);
    return;
  }
  renderList();
  show('list');
  byId<HTMLInputElement>('search').focus();
}

function avatar(host: string, large = false): HTMLElement {
  const el = document.createElement('div');
  el.className = large ? 'avatar large' : 'avatar';
  el.style.background = avatarColor(host);
  el.textContent = host.charAt(0) || '?';
  return el;
}

function renderList(): void {
  const query = byId<HTMLInputElement>('search').value.trim().toLowerCase();
  const list = byId('cred-list');
  list.replaceChildren();
  const visible = credentials.filter(
    (c) => !query || c.host.includes(query) || c.username.toLowerCase().includes(query),
  );
  for (const c of visible) {
    const li = document.createElement('li');
    li.className = 'cred-item';
    li.tabIndex = 0;
    const textWrap = document.createElement('div');
    textWrap.className = 'cred-text';
    const host = document.createElement('div');
    host.className = 'cred-host';
    host.textContent = c.host;
    const user = document.createElement('div');
    user.className = 'cred-user';
    user.textContent = c.username || '(no username)';
    textWrap.append(host, user);
    li.append(avatar(c.host), textWrap);
    li.addEventListener('click', () => void openDetail(c.id));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void openDetail(c.id);
    });
    list.append(li);
  }
  byId('list-empty').hidden = credentials.length > 0;
  if (credentials.length > 0 && visible.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted empty';
    li.textContent = 'No matches.';
    list.append(li);
  }
}

// ----------------------------------------------------------------------------- detail

async function copy(textValue: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(textValue);
    toast(`${what} copied`);
  } catch {
    toast('Could not access the clipboard', true);
  }
}

async function openDetail(id: string): Promise<void> {
  try {
    current = await send({ type: 'revealCredential', id });
  } catch (err) {
    toast(friendlyError(err), true);
    return refresh();
  }
  const c = current;
  byId('detail-avatar').replaceWith(Object.assign(avatar(c.host, true), { id: 'detail-avatar' }));
  byId('detail-host').textContent = c.host;
  const summary = credentials.find((x) => x.id === id);
  byId('detail-updated').textContent = summary ? `Updated ${relativeTime(summary.updatedAt)}` : '';
  byId('detail-username').textContent = c.username || '(no username)';
  byId('detail-password').textContent = '••••••••••';
  byId('toggle-password').textContent = 'Show';

  const historyWrap = byId<HTMLDetailsElement>('detail-history-wrap');
  const history = byId('detail-history');
  history.replaceChildren();
  historyWrap.hidden = c.history.length === 0;
  historyWrap.open = false;
  for (const h of c.history) {
    const li = document.createElement('li');
    const when = document.createElement('span');
    when.textContent = `Replaced ${relativeTime(h.changedAt)}`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => void copy(h.password, 'Old password'));
    li.append(when, btn);
    history.append(li);
  }
  show('detail');
  current = c; // show() clears it for other views; keep it for this one
}

function bindDetail(): void {
  byId('detail-back').addEventListener('click', () => void loadList());
  byId('copy-username').addEventListener('click', () => {
    if (current) void copy(current.username, 'Username');
  });
  byId('copy-password').addEventListener('click', () => {
    if (current) void copy(current.password, 'Password');
  });
  byId('toggle-password').addEventListener('click', () => {
    if (!current) return;
    const el = byId('detail-password');
    const hidden = byId('toggle-password').textContent === 'Show';
    el.textContent = hidden ? current.password : '••••••••••';
    byId('toggle-password').textContent = hidden ? 'Hide' : 'Show';
  });
  byId('detail-edit').addEventListener('click', () => {
    if (current) openForm(current);
  });
  byId('detail-delete').addEventListener('click', async () => {
    if (!current) return;
    if (!confirm(`Delete the login for ${current.username || 'this site'} on ${current.host}?`)) return;
    try {
      await send({ type: 'deleteCredential', id: current.id });
      toast('Login deleted');
      await loadList();
    } catch (err) {
      toast(friendlyError(err), true);
    }
  });
}

// ----------------------------------------------------------------------------- add / edit

async function activeTabHost(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return siteFromUrl(tab?.url)?.host ?? '';
  } catch {
    return '';
  }
}

function openForm(existing: CredentialSecret | null): void {
  editingId = existing?.id ?? null;
  byId('form-title').textContent = existing ? 'Edit login' : 'Add login';
  byId<HTMLInputElement>('cred-host').value = existing?.host ?? '';
  byId<HTMLInputElement>('cred-username').value = existing?.username ?? '';
  byId<HTMLInputElement>('cred-password').value = existing?.password ?? '';
  byId<HTMLInputElement>('cred-password').type = 'password';
  byId('cred-show').textContent = 'Show';
  byId('form-error').textContent = '';
  show('form');
  if (!existing) {
    void activeTabHost().then((host) => {
      const input = byId<HTMLInputElement>('cred-host');
      if (!input.value) input.value = host;
    });
  }
  byId<HTMLInputElement>(existing ? 'cred-password' : 'cred-host').focus();
}

function bindForm(): void {
  byId('form-back').addEventListener('click', () => {
    if (editingId) void openDetail(editingId);
    else void loadList();
  });
  byId('cred-show').addEventListener('click', () => {
    const input = byId<HTMLInputElement>('cred-password');
    input.type = input.type === 'password' ? 'text' : 'password';
    byId('cred-show').textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
  byId('cred-generate').addEventListener('click', () => {
    const input = byId<HTMLInputElement>('cred-password');
    input.value = generatePassword();
    input.type = 'text';
    byId('cred-show').textContent = 'Hide';
  });
  byId<HTMLFormElement>('form-cred').addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = byId<HTMLInputElement>('cred-host').value;
    const username = byId<HTMLInputElement>('cred-username').value;
    const password = byId<HTMLInputElement>('cred-password').value;
    const error = byId('form-error');
    error.textContent = '';
    if (!host.trim()) return void (error.textContent = 'Enter the site, e.g. github.com');
    if (!password) return void (error.textContent = 'Enter a password.');
    try {
      if (editingId) {
        await send({ type: 'updateCredential', id: editingId, host, username, password });
        toast('Login updated');
        const id = editingId;
        credentials = await send({ type: 'listCredentials' });
        await openDetail(id);
      } else {
        const { result } = await send({ type: 'addCredential', host, username, password });
        toast(result === 'updated' ? 'Existing login updated' : result === 'unchanged' ? 'Already saved' : 'Login saved');
        await loadList();
      }
    } catch (err) {
      error.textContent = friendlyError(err);
    }
  });
}

// ----------------------------------------------------------------------------- toolbar

function bindToolbar(): void {
  byId('btn-lock').addEventListener('click', async () => {
    await send({ type: 'lock' }).catch(() => undefined);
    credentials = [];
    toast('Vault locked');
    await refresh();
  });
  byId('btn-options').addEventListener('click', () => void chrome.runtime.openOptionsPage());
  byId('btn-add').addEventListener('click', () => openForm(null));
  byId('search').addEventListener('input', renderList);

  const syncBtn = byId<HTMLButtonElement>('btn-sync');
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.classList.add('spinning');
    try {
      const sync = await send({ type: 'syncNow' });
      if (state) state.sync = sync;
      toast('Synced to Google Drive');
    } catch (err) {
      toast(friendlyError(err), true);
      state = await send({ type: 'getState' }).catch(() => state);
    } finally {
      syncBtn.disabled = false;
      syncBtn.classList.remove('spinning');
      renderFooter();
    }
  });
}

// ----------------------------------------------------------------------------- boot

bindSetup();
bindUnlock();
bindDetail();
bindForm();
bindToolbar();
void refresh();
