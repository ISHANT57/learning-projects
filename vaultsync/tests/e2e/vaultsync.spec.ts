// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// End-to-end tests: real Chromium with the built extension (dist/) loaded, driving local
// test pages. Run with `npm run test:e2e` (builds first).
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve('dist');
const MASTER = 'e2e master password 1';
const L = 'http://localhost:4173';
const IP = 'http://127.0.0.1:4173';

let context: BrowserContext;
let extensionId: string;
let userDataDir: string;

test.describe.configure({ mode: 'serial' });

async function serviceWorker(): Promise<Worker> {
  const existing = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  return existing ?? context.waitForEvent('serviceworker');
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'vaultsync-e2e-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', // Playwright's Chromium in new headless mode supports extensions
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = await serviceWorker();
  extensionId = new URL(sw.url()).host;
});

test.afterAll(async () => {
  await context?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

async function openPopup(): Promise<Page> {
  const page = await context.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  return page;
}

async function savedLogins(): Promise<string[]> {
  const popup = await openPopup();
  await expect(popup.locator('#view-list')).toBeVisible();
  const hosts = await popup.locator('.cred-item .cred-host').allInnerTexts();
  const users = await popup.locator('.cred-item .cred-user').allInnerTexts();
  await popup.close();
  return hosts.map((h, i) => `${h.trim()} ${users[i]?.trim() ?? ''}`);
}

type Answer = 'Save' | 'Never' | 'No thanks';

/** Answers the "Save password?" prompt (an extension iframe) and returns its title. */
async function answerPrompt(page: Page, answer: Answer, edits: { username?: string } = {}): Promise<string> {
  const prompt = page.frameLocator('iframe[data-vaultsync-prompt]');
  await expect(prompt.locator('#card')).toBeVisible();
  const title = await prompt.locator('#title').innerText();
  await expect(prompt.locator('#password')).toHaveAttribute('type', 'password'); // masked by default
  if (edits.username !== undefined) await prompt.locator('#username').fill(edits.username);
  await prompt.getByRole('button', { name: answer, exact: true }).click();
  await expect(page.locator('iframe[data-vaultsync-prompt]')).toHaveCount(0, { timeout: 6_000 });
  return title;
}

/** Logs in on a test page; answers the save prompt unless `answer` is null (e.g. locked). */
async function login(
  url: string,
  username: string,
  password: string,
  answer: Answer | null = 'Save',
  edits: { username?: string } = {},
): Promise<string | null> {
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await Promise.all([page.waitForURL(/welcome/), page.locator('#submit').click()]);
  const title = answer ? await answerPrompt(page, answer, edits) : null;
  await page.waitForTimeout(300);
  await page.close();
  return title;
}

test('first run: create the master password', async () => {
  const popup = await openPopup();
  await expect(popup.locator('#view-setup')).toBeVisible();
  await expect(popup.locator('#credit')).toHaveText('Made by Ishant · © 2026 IMPS');
  await popup.locator('#setup-password').fill('too short');
  await popup.locator('#setup-confirm').fill('too short');
  await popup.locator('#setup-submit').click();
  await expect(popup.locator('#setup-error')).toContainText('at least 12');
  await popup.locator('#setup-password').fill(MASTER);
  await popup.locator('#setup-confirm').fill(MASTER);
  await popup.locator('#setup-submit').click();
  await expect(popup.locator('#view-list')).toBeVisible({ timeout: 15_000 });
  await expect(popup.locator('#list-empty')).toBeVisible();
  await popup.close();
});

test('asks "Save password?" after a form login and saves on Save', async () => {
  expect(await login(`${L}/login.html`, 'alice', 'alice-pw-1')).toBe('Save password?');
  expect(await savedLogins()).toContain('localhost alice');
});

test('save prompt: "No thanks" does not save', async () => {
  await login(`${L}/login.html`, 'zed', 'zed-pw', 'No thanks');
  expect((await savedLogins()).join()).not.toContain('zed');
});

test('auto-fills on return visits', async () => {
  const page = await context.newPage();
  await page.goto(`${L}/login.html`);
  await expect(page.locator('#username')).toHaveValue('alice');
  await expect(page.locator('#password')).toHaveValue('alice-pw-1');
  await page.close();
});

test('updates instead of duplicating when the password changes', async () => {
  expect(await login(`${L}/login.html`, 'alice', 'alice-pw-2')).toBe('Update password?');
  const logins = await savedLogins();
  expect(logins.filter((t) => t.includes('alice'))).toHaveLength(1);
  const page = await context.newPage();
  await page.goto(`${L}/login.html`);
  await expect(page.locator('#password')).toHaveValue('alice-pw-2');
  await page.close();
});

test('fills React-style controlled inputs (native setter + events)', async () => {
  const page = await context.newPage();
  await page.goto(`${L}/react.html`);
  await expect(page.locator('#state-user')).toHaveText('alice');
  await expect(page.locator('#state-pw')).toHaveText(String('alice-pw-2'.length));
  await page.close();
});

test('re-fills after SPA navigation (history.pushState)', async () => {
  const page = await context.newPage();
  await page.goto(`${L}/spa.html`);
  await page.locator('#go').click();
  await expect(page).toHaveURL(/\/spa\/login$/);
  await expect(page.locator('#password')).toHaveValue('alice-pw-2');
  await expect(page.locator('#username')).toHaveValue('alice');
  await page.close();
});

test('multi-step login: email on page 1, password on page 2', async () => {
  const page = await context.newPage();
  await page.goto(`${IP}/step1.html`);
  await page.locator('#email').fill('bob@example.com');
  await Promise.all([page.waitForURL(/step2/), page.locator('#next').click()]);
  await page.locator('#password').fill('bob-pw-1');
  await Promise.all([page.waitForURL(/welcome/), page.locator('#submit').click()]);
  const prompt = page.frameLocator('iframe[data-vaultsync-prompt]');
  await expect(prompt.locator('#username')).toHaveValue('bob@example.com'); // from page 1
  await answerPrompt(page, 'Save');
  await page.close();
  expect(await savedLogins()).toContain('127.0.0.1 bob@example.com');
});

test('iframes: each frame only gets credentials for its own site', async () => {
  const page = await context.newPage();
  await page.goto(`${L}/iframe.html`);
  const frame = page.frameLocator('#frame');
  // The top page is localhost (alice), but the iframe is 127.0.0.1 -> must get bob, never alice.
  await expect(frame.locator('#username')).toHaveValue('bob@example.com');
  await expect(frame.locator('#password')).toHaveValue('bob-pw-1');
  // Capture inside the iframe works too.
  await frame.locator('#username').fill('carol');
  await frame.locator('#password').fill('carol-pw');
  await frame.locator('#submit').click();
  // The prompt appears in the TOP page, not inside the iframe.
  await answerPrompt(page, 'Save');
  await page.close();
  expect(await savedLogins()).toContain('127.0.0.1 carol');
});

test('does not fill hidden (honeypot) password fields', async () => {
  const page = await context.newPage();
  await page.goto(`${L}/hidden.html`);
  await page.waitForTimeout(2_000);
  await expect(page.locator('#password')).toHaveValue('');
  await page.close();
});

test('vault stays unlocked after the service worker is stopped (session key)', async () => {
  // Plant a marker in the worker's JS memory. A real restart wipes it.
  const before = await serviceWorker();
  await before.evaluate(() => {
    (globalThis as unknown as { __vsMarker?: string }).__vsMarker = 'original-process';
  });

  // Stop the extension's service worker from chrome://serviceworker-internals, the same
  // as Chrome stopping an idle worker.
  const internals = await context.newPage();
  await internals.goto('chrome://serviceworker-internals/');
  const entry = internals.locator('.serviceworker-registration', { hasText: extensionId });
  await entry.locator('cr-button[data-command="stop"]').first().click();
  await expect(entry.locator('.serviceworker-running-status')).toContainText(/STOPPED/i, { timeout: 15_000 });
  await internals.close();

  // A page load sends getFillData, which wakes a NEW worker process.
  const page = await context.newPage();
  await page.goto(`${L}/login.html`);
  await expect(page.locator('#password')).toHaveValue('alice-pw-2'); // still unlocked via session key
  await page.close();

  const after = context.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extensionId}`));
  expect(after).toBeTruthy();
  const marker = await after!.evaluate(() => (globalThis as unknown as { __vsMarker?: string }).__vsMarker ?? null);
  expect(marker).toBeNull(); // proves this is a fresh worker process
});

test('lock stops auto-fill; wrong master password shows an error', async () => {
  const popup = await openPopup();
  await expect(popup.locator('#view-list')).toBeVisible();
  await popup.locator('#btn-lock').click();
  await expect(popup.locator('#view-locked')).toBeVisible();

  const page = await context.newPage();
  await page.goto(`${L}/login.html`);
  await page.waitForTimeout(2_000);
  await expect(page.locator('#password')).toHaveValue('');
  await page.close();

  await popup.locator('#unlock-password').fill('definitely wrong!!');
  await popup.locator('#unlock-submit').click();
  await expect(popup.locator('#unlock-error')).toHaveText('Wrong master password. Please try again.');
  await popup.close();
});

test('logins captured while locked are saved after unlocking', async () => {
  await login(`${L}/login.html`, 'dave', 'dave-pw', null); // locked: queued, no prompt
  const popup = await openPopup();
  await expect(popup.locator('#locked-pending')).toContainText('1 captured login');
  await popup.locator('#unlock-password').fill(MASTER);
  await popup.locator('#unlock-submit').click();
  await expect(popup.locator('#view-list')).toBeVisible({ timeout: 15_000 });
  await expect(popup.locator('.cred-item', { hasText: 'dave' })).toBeVisible();
  await popup.close();
});

test('popup: reveal, copy-ready detail, password history, manual add', async () => {
  const popup = await openPopup();
  await popup.locator('.cred-item', { hasText: 'alice' }).click();
  await expect(popup.locator('#detail-host')).toHaveText('localhost');
  await expect(popup.locator('#detail-password')).toHaveText('••••••••••');
  await popup.locator('#toggle-password').click();
  await expect(popup.locator('#detail-password')).toHaveText('alice-pw-2');
  await expect(popup.locator('#detail-history-wrap')).toBeVisible(); // alice-pw-1 kept
  await popup.locator('#detail-back').click();

  await popup.locator('#btn-add').click();
  await popup.locator('#cred-host').fill('https://www.example.org/login');
  await popup.locator('#cred-username').fill('erin');
  await popup.locator('#cred-generate').click();
  await popup.locator('#form-submit').click();
  await expect(popup.locator('.cred-item', { hasText: 'example.org' })).toBeVisible();
  await popup.locator('#search').fill('example.org');
  await expect(popup.locator('.cred-item')).toHaveCount(1);
  await popup.close();
});

test('save prompt: the username can be corrected before saving', async () => {
  await login(`${L}/login.html`, 'typo-usr', 'fixed-pw', 'Save', { username: 'fixed-user' });
  const logins = (await savedLogins()).join();
  expect(logins).toContain('localhost fixed-user');
  expect(logins).not.toContain('typo-usr');
});

test('options: encrypted export and import round-trip', async () => {
  const options = await context.newPage();
  options.on('dialog', (d) => void d.accept());
  await options.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await expect(options.locator('#not-configured')).toBeVisible(); // no OAuth client in test builds
  await expect(options.locator('#fingerprint')).toHaveText('IMPS-VS-5FA22D0791658C41');

  const [download] = await Promise.all([options.waitForEvent('download'), options.locator('#btn-export').click()]);
  const file = join(userDataDir, 'export.json');
  await download.saveAs(file);
  const json = readFileSync(file, 'utf8');
  expect(JSON.parse(json).format).toBe('vaultsync-export');
  expect(json).not.toContain('alice-pw-2'); // export is encrypted

  await options.locator('#import-file').setInputFiles(file);
  await options.locator('#import-password').fill('wrong password!!');
  await options.locator('#import-form button[type="submit"]').click();
  await expect(options.locator('#toast')).toContainText('Wrong master password');
  await options.locator('#import-password').fill(MASTER);
  await options.locator('#import-form button[type="submit"]').click();
  await expect(options.locator('#toast')).toContainText(/Imported \d+ login/);
  writeFileSync(file, '');
  await options.close();
});

test('settings: turning auto-fill off stops filling', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await options.locator('.switch:has(#autofill) span').click();
  await expect(options.locator('#toast')).toHaveText('Settings saved');
  const page = await context.newPage();
  await page.goto(`${L}/login.html`);
  await page.waitForTimeout(2_000);
  await expect(page.locator('#password')).toHaveValue('');
  await page.close();
  await options.locator('.switch:has(#autofill) span').click();
  await options.close();
});

test('save prompt: "Never" stops prompts for that site; Options can undo it', async () => {
  await login(`${IP}/login.html`, 'nina', 'nina-pw', 'Never');
  // Next login on the same site: no prompt at all.
  const page = await context.newPage();
  await page.goto(`${IP}/login.html`);
  await page.locator('#username').fill('nina');
  await page.locator('#password').fill('nina-pw-2');
  await Promise.all([page.waitForURL(/welcome/), page.locator('#submit').click()]);
  await page.waitForTimeout(2_000);
  await expect(page.locator('iframe[data-vaultsync-prompt]')).toHaveCount(0);
  await page.close();
  expect((await savedLogins()).join()).not.toContain('nina');

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  const row = options.locator('#never-list li', { hasText: '127.0.0.1' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(options.locator('#never-empty')).toBeVisible();
  await options.close();
  expect(await login(`${IP}/login.html`, 'nina', 'nina-pw-3')).toBe('Save password?');
});

test('the web page cannot read the save prompt', async () => {
  const page = await context.newPage();
  await page.goto(`${L}/login.html`);
  await page.locator('#username').fill('pat');
  await page.locator('#password').fill('pat-secret-pw');
  await Promise.all([page.waitForURL(/welcome/), page.locator('#submit').click()]);
  await expect(page.frameLocator('iframe[data-vaultsync-prompt]').locator('#card')).toBeVisible();
  // Code running in the page itself tries to look inside the prompt.
  const leaked = await page.evaluate(() => {
    const frame = document.querySelector('iframe[data-vaultsync-prompt]') as HTMLIFrameElement;
    try {
      return frame.contentDocument?.body?.innerHTML ?? 'blocked';
    } catch {
      return 'blocked';
    }
  });
  expect(leaked).toBe('blocked');
  expect(await page.content()).not.toContain('pat-secret-pw');
  await answerPrompt(page, 'No thanks');
  await page.close();
});

test('auto-lock after the inactivity timeout', async () => {
  const sw = await serviceWorker();
  // Pretend the last user activity was 20 minutes ago (timeout is 15), then wait for
  // the once-a-minute auto-lock alarm.
  // (Polls storage from the worker - opening the popup would itself count as activity.)
  await sw.evaluate(() => chrome.storage.session.set({ lastActivity: Date.now() - 20 * 60_000 }));
  await expect
    .poll(
      async () => {
        const worker = await serviceWorker();
        return worker.evaluate(async () => Boolean((await chrome.storage.session.get('sessionKey')).sessionKey));
      },
      { timeout: 80_000, intervals: [5_000] },
    )
    .toBe(false);
  const popup = await openPopup();
  await expect(popup.locator('#view-locked')).toBeVisible();
  await popup.close();
});
