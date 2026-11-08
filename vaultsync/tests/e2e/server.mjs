// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
// Tiny static server for the E2E test pages. Reachable as http://localhost:4173 and
// http://127.0.0.1:4173 - two different hostnames, used to test per-site isolation.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'pages');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };

createServer(async (req, res) => {
  let path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path === '/' || path.startsWith('/spa')) path = '/spa.html'; // SPA routes fall back to the shell
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(4173, () => console.log('test pages on http://localhost:4173'));
