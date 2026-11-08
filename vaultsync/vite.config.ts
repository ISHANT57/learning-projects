// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import { defineConfig, loadEnv } from 'vite';
import baseManifest from './manifest.json';

const PLACEHOLDER = '__GOOGLE_OAUTH_CLIENT_ID__';

export default defineConfig(({ mode }) => {
  // The OAuth client ID is environment-specific (it is bound to the extension ID in
  // Google Cloud), so it is injected from .env instead of being committed.
  const env = loadEnv(mode, process.cwd(), '');
  const clientId = (env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim();

  if (!clientId) {
    console.warn(
      '\n[vaultsync] GOOGLE_OAUTH_CLIENT_ID is not set - the extension will build and work, ' +
        'but Google Drive sync stays disabled. See README -> "Google Drive sync setup".\n',
    );
  }

  const manifest = {
    ...baseManifest,
    oauth2: { ...baseManifest.oauth2, client_id: clientId || PLACEHOLDER },
  } as unknown as ManifestV3Export;

  return {
    plugins: [
      crx({
        manifest,
        contentScripts: {
          // Build content scripts as self-contained IIFE bundles instead of loader +
          // shared chunks. This (a) gives exact document_start timing for the MAIN-world
          // SPA hook and (b) avoids web_accessible_resources, which would let any website
          // detect that VaultSync is installed.
          standaloneFiles: [
            'src/content/spaHooks.ts',
            'src/content/formDetector.ts',
            'src/content/autoFill.ts',
          ],
        },
      }),
    ],
    build: {
      target: 'es2022',
      sourcemap: false,
      emptyOutDir: true,
      rollupOptions: {
        // The "Save password?" prompt is only referenced from web_accessible_resources,
        // so it must be listed here to be bundled like the popup and options pages.
        input: { prompt: 'src/prompt/prompt.html' },
      },
    },
  };
});
