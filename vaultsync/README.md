# VaultSync Password Manager

**Made by Ishant · © 2026 IMPS. All rights reserved.** See [LICENSE](LICENSE). Fingerprint: `IMPS-VS-5FA22D0791658C41`

**[⬇ Download the latest release](https://github.com/ISHANT57/learning-projects/releases/tag/vaultsync-v1.0.0)** · [Project guide (PDF)](VaultSync%20-%20Project%20Guide.pdf)

A Chrome extension (Manifest V3) that saves the logins you type, auto-fills them on your next visit, encrypts everything with a master password, and can back up the **encrypted** vault to your Google Drive with a Markdown activity log.

- **Encryption:** AES-256-GCM, with the key derived by PBKDF2-SHA256 (600,000 iterations, random 16-byte salt) and a fresh 12-byte IV for every save. Everything uses the browser's Web Crypto API; there are no crypto libraries.
- **Capture & auto-fill:** classic forms, React/Angular/Vue inputs, single-page apps, multi-step logins (email first, then password) and iframes.
- **Google Drive:** `vaultsync-backup.enc` (encrypted vault) and `vaultsync-activity-log.md` (site, username, time and action, **never** passwords).
- **Tech:** TypeScript, Vite + @crxjs/vite-plugin, vanilla HTML/CSS, Drive REST API v3 via `fetch`.

---

## 1. Install & build

You need Node.js 20+ and npm.

```bash
npm install
npm run build        # outputs dist/
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev build with hot reload |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Builds, then runs end-to-end tests in a real Chromium (Playwright). The first time, run `npx playwright install chromium`. |
| `npm run zip` | Zips `dist/` into `vaultsync-<version>.zip` |

## 2. Load it in Chrome

1. Either build it (above) or download `vaultsync-1.0.0.zip` from the release and unzip it. Then open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the **`dist`** folder (or the unzipped release folder).
4. Pin VaultSync from the puzzle-piece menu, then click its icon to create your master password.

The manifest contains a fixed public `key`, so the extension ID is always **`bofjkmngechemcnbpemcghboomfhihao`**. Google sign-in needs that ID to stay the same. Everything except Google sync also works in Microsoft Edge and other Chromium browsers.

## 3. Google Drive sync setup

Sync uses `chrome.identity.getAuthToken`, which **only works in Google Chrome** while you're signed in to Chrome with a Google account.

1. Go to <https://console.cloud.google.com/> and **create a project**, e.g. "VaultSync".
2. Go to **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type: **External**. Fill in the app name, support email and developer email.
   - **Data access / Scopes:** add `https://www.googleapis.com/auth/drive.file`.
   - **Audience / Test users:** add the Google account(s) you'll use. While the app is in "Testing", only test users can sign in.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Chrome Extension**.
   - Item ID: **`bofjkmngechemcnbpemcghboomfhihao`**.
   - Create it and copy the **Client ID** (ends with `.apps.googleusercontent.com`).
5. In this folder, copy `.env.example` to `.env` and paste the ID:
   ```
   GOOGLE_OAUTH_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
   ```
6. Run `npm run build`, then click **Reload** on VaultSync in `chrome://extensions`.
7. Open VaultSync **Settings** (gear icon) and click **Connect Google account**, then approve the consent screen.

Without a client ID, the extension still builds and works fully offline. The popup and settings page will say "Google sync not set up for this build".

## 4. How to test each feature

| Feature | How to check it |
|---|---|
| Create master password | First click on the icon shows *Create your master password* (minimum 12 characters, plus a strength meter). |
| Capture | Log in to any site, e.g. a test account. A notification says *Login saved*, and the site appears in the popup. |
| De-duplication | Log in again with a new password for the same username. You'll see *Password updated* rather than a second entry, and the old password moves to *Previous passwords*. |
| Auto-fill | Revisit the login page. After about 1 second the username and password are filled. |
| SPA / multi-step | Try a site that asks for your email first and the password on the next page (e.g. Google, Microsoft). |
| Locked capture | Click **Lock**, then log in somewhere. The icon badge shows **1**; unlock and it's saved. |
| Wrong password | Unlock with a wrong password. You get the error *Wrong master password*. |
| Auto-lock | Set auto-lock to 5 minutes in Settings and don't use VaultSync for 5 minutes. The popup shows *Vault locked*. |
| Export / import | Settings → **Export encrypted vault**, then **Import vault file…** with that file and its master password. |
| Drive backup | After connecting, save a login. Within about 10 seconds `vaultsync-backup.enc` and `vaultsync-activity-log.md` appear in [drive.google.com](https://drive.google.com). Open the `.md` file to see the table. |
| Restore | Settings → **Restore from Drive…**, then unlock with the backup's master password. |

## 5. Security design

| Rule | How it's enforced |
|---|---|
| No plaintext passwords stored anywhere | Only the AES-GCM envelope is written to `chrome.storage.local` and Drive. The Drive log rows are built from a type that has no password field. Notifications never include passwords. |
| Master password never stored | It's only used to derive the key. A wrong password is detected by the GCM authentication tag failing, so no password hash is stored. |
| Key cleared on lock | Lock and auto-lock delete the key from memory and from `chrome.storage.session`. |
| Least-privilege OAuth | The only scope is `drive.file`, so VaultSync can only see files it created. Your email comes from `getProfileUserInfo` (the `identity.email` permission), not an extra OAuth scope. |
| Content scripts never see the key or vault | Content scripts can only send `capture`, `rememberUsername` and `getFillData`. The **site is taken from `sender.url`** (set by Chrome) and never from the page, and auto-fill only returns logins for that exact frame's own host. Everything else is accepted only from the extension's own pages. |
| Service-worker termination | All state lives in `chrome.storage`. While unlocked, the key is kept in `chrome.storage.session`: RAM only, wiped when the browser closes, unreadable by content scripts. A restart therefore resumes the unlocked state, and after a browser restart the vault is locked. |
| Honeypot protection | Only visible fields are filled. Sign-up and change-password forms are skipped, fields you typed in are never overwritten, and `https` logins are never filled on `http` pages. |
| Not detectable by websites | Content scripts are built as standalone bundles, so the manifest has **no `web_accessible_resources`** that a website could probe. |

**Extras beyond the original spec:** password history (last 5), saving logins captured while locked, Restore from Drive, a password generator, and a minimum master-password length with a strength meter.

**Deliberate deviations from the spec:**
- **The `email` OAuth scope isn't requested.** It isn't needed (see Least-privilege OAuth above).
- **The `scripting` and `tabs` permissions are dropped.** Content scripts are declared statically, and `activeTab` is enough for the popup to pre-fill the current site.
- **The key lives in `chrome.storage.session` rather than only in worker memory.** Without this, Chrome would lock the vault every ~30 seconds.

## 6. Known limitations

- **Drive sync requires Google Chrome**, not Edge or Brave, because of `getAuthToken`.
- **Last-write-wins:** using VaultSync on two computers with the same Drive doesn't merge vaults.
- **Exact hostname matching** (`www.` is ignored), so `accounts.google.com` and `google.com` are separate.
- **The clipboard isn't cleared automatically** after copying a password.
- **The activity log in Drive is not encrypted.** It shows site names and usernames, and can be turned off in Settings.
- **Not published to the Chrome Web Store.**

## 7. Project layout

```
manifest.json            MV3 manifest (OAuth client ID injected from .env at build time)
vite.config.ts           Vite + crxjs build config
src/background/          service worker: index (router, alarms), crypto, session, vault, drive, settings
src/content/             formDetector (capture), autoFill, spaHooks (page-world history hook), dom helpers
src/popup/  src/options/ vanilla HTML/CSS/TS user interface
src/shared/              types, constants, messages, url + ui helpers
public/                  icons, _locales
tests/unit/              Vitest: crypto, vault, drive (fake Drive API), content, url
tests/e2e/               Playwright: real Chromium + extension against local test pages
scripts/                 make-icons.py, zip.mjs, make-guide-pdf.py
PROJECT_GUIDE.md         plain-English guide (also as "VaultSync - Project Guide.pdf")
```
