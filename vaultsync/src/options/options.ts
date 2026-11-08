// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.

import { OWNER } from '../shared/constants';
import { send } from '../shared/messages';
import type { AppState, Settings, SyncStatus } from '../shared/types';
import { byId, friendlyError, relativeTime, toast } from '../shared/ui';

let state: AppState | null = null;
let importText = '';

// ----------------------------------------------------------------------------- render

function renderSync(sync: SyncStatus): void {
  byId('not-configured').hidden = sync.configured;
  byId('ext-id').textContent = chrome.runtime.id;
  const dot = byId('g-dot');
  const status = byId('g-status');
  const detail = byId('g-detail');

  dot.className = 'dot';
  if (!sync.configured) {
    status.textContent = 'Not available in this build';
    detail.textContent = '';
  } else if (!sync.connected) {
    status.textContent = 'Not connected';
    detail.textContent = 'Connect to back up your encrypted vault to Google Drive.';
  } else {
    dot.classList.add(sync.lastError ? 'err' : 'ok');
    status.textContent = `Connected as ${sync.email ?? 'your Google account'}`;
    detail.textContent = sync.lastError
      ? `Last sync failed: ${sync.lastError}`
      : `Last synced ${relativeTime(sync.lastSynced)}${sync.lastSynced ? ` (${new Date(sync.lastSynced).toLocaleString()})` : ''}`;
  }

  byId<HTMLButtonElement>('btn-connect').hidden = sync.connected;
  byId<HTMLButtonElement>('btn-connect').disabled = !sync.configured;
  for (const id of ['btn-sync', 'btn-restore', 'btn-disconnect']) byId(id).hidden = !sync.connected;
}

function renderSettings(settings: Settings): void {
  byId<HTMLSelectElement>('autolock').value = String(settings.autoLockMinutes);
  byId<HTMLInputElement>('autofill').checked = settings.autoFill;
  byId<HTMLInputElement>('activitylog').checked = settings.activityLog;
}

async function refresh(): Promise<void> {
  state = await send({ type: 'getState' });
  byId('vault-state').textContent = !state.hasVault
    ? 'No vault yet - open the VaultSync toolbar popup to create your master password.'
    : state.unlocked
      ? 'Vault unlocked'
      : 'Vault locked - unlock it from the toolbar popup to export.';
  renderSync(state.sync);
  renderSettings(state.settings);
}

// ----------------------------------------------------------------------------- actions

async function busy(button: HTMLButtonElement, label: string, fn: () => Promise<void>): Promise<void> {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    await fn();
  } catch (err) {
    toast(friendlyError(err), true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function bindGoogle(): void {
  const connect = byId<HTMLButtonElement>('btn-connect');
  connect.addEventListener('click', () =>
    busy(connect, 'Connecting…', async () => {
      const sync = await send({ type: 'connectGoogle' });
      renderSync(sync);
      toast(sync.lastError ? `Connected, but the first sync failed: ${sync.lastError}` : 'Google Drive connected', !!sync.lastError);
    }),
  );

  const sync = byId<HTMLButtonElement>('btn-sync');
  sync.addEventListener('click', () =>
    busy(sync, 'Syncing…', async () => {
      renderSync(await send({ type: 'syncNow' }));
      toast('Synced to Google Drive');
    }).finally(() => void refresh()),
  );

  const restore = byId<HTMLButtonElement>('btn-restore');
  restore.addEventListener('click', () => {
    const ok = confirm(
      'Replace the vault in this browser with the backup from Google Drive?\n\n' +
        'Any logins saved here since that backup will be lost. The vault will be locked; ' +
        'unlock it with the master password of the backup.',
    );
    if (!ok) return;
    void busy(restore, 'Restoring…', async () => {
      await send({ type: 'restoreFromDrive' });
      toast('Backup restored - unlock it from the toolbar popup');
      await refresh();
    });
  });

  const disconnect = byId<HTMLButtonElement>('btn-disconnect');
  disconnect.addEventListener('click', () => {
    if (!confirm('Disconnect Google Drive? Your files in Drive are kept.')) return;
    void busy(disconnect, 'Disconnecting…', async () => {
      renderSync(await send({ type: 'disconnectGoogle' }));
      toast('Google Drive disconnected');
    });
  });
}

function bindSettings(): void {
  const save = async (patch: Partial<Settings>) => {
    try {
      renderSettings(await send({ type: 'updateSettings', settings: patch }));
      toast('Settings saved');
    } catch (err) {
      toast(friendlyError(err), true);
      await refresh();
    }
  };
  byId<HTMLSelectElement>('autolock').addEventListener('change', (e) =>
    void save({ autoLockMinutes: Number((e.target as HTMLSelectElement).value) }),
  );
  byId<HTMLInputElement>('autofill').addEventListener('change', (e) =>
    void save({ autoFill: (e.target as HTMLInputElement).checked }),
  );
  byId<HTMLInputElement>('activitylog').addEventListener('change', (e) =>
    void save({ activityLog: (e.target as HTMLInputElement).checked }),
  );
}

function bindBackup(): void {
  const exportBtn = byId<HTMLButtonElement>('btn-export');
  exportBtn.addEventListener('click', () =>
    busy(exportBtn, 'Exporting…', async () => {
      const { fileName, json } = await send({ type: 'exportVault' });
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast(`Saved ${fileName}`);
    }),
  );

  const fileInput = byId<HTMLInputElement>('import-file');
  const form = byId<HTMLFormElement>('import-form');
  byId('btn-import-pick').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('That file is too large to be a VaultSync export.', true);
      return;
    }
    importText = await file.text();
    byId('import-name').textContent = file.name;
    form.hidden = false;
    byId<HTMLInputElement>('import-password').focus();
  });
  byId('import-cancel').addEventListener('click', () => {
    form.hidden = true;
    importText = '';
    fileInput.value = '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = byId<HTMLInputElement>('import-password');
    if (!password.value) {
      toast('Enter the master password of the export file.', true);
      return;
    }
    if (state?.hasVault && !confirm('This replaces your current vault. Continue?')) return;
    try {
      const { count } = await send({ type: 'importVault', fileText: importText, password: password.value });
      password.value = '';
      form.hidden = true;
      fileInput.value = '';
      importText = '';
      toast(`Imported ${count} login(s). The vault is unlocked with the file's master password.`);
      await refresh();
    } catch (err) {
      toast(friendlyError(err), true);
    }
  });
}

function bindDanger(): void {
  const input = byId<HTMLInputElement>('clear-confirm');
  const button = byId<HTMLButtonElement>('btn-clear');
  input.addEventListener('input', () => {
    button.disabled = input.value.trim() !== 'DELETE';
  });
  button.addEventListener('click', () => {
    if (!confirm('Permanently delete all VaultSync data from this browser? This cannot be undone.')) return;
    void busy(button, 'Clearing…', async () => {
      await send({ type: 'clearAllData' });
      input.value = '';
      toast('All VaultSync data was cleared from this browser');
      await refresh();
    }).finally(() => {
      button.disabled = true;
    });
  });
}

byId('fingerprint').textContent = OWNER.FINGERPRINT;
bindGoogle();
bindSettings();
bindBackup();
bindDanger();
void refresh().catch((err) => toast(friendlyError(err), true));
