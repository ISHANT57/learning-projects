// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// Shows the "Save password?" prompt in the top frame, like Chrome's own bubble.
//
// SECURITY: the prompt is an <iframe> served from chrome-extension://<id>/. Because it is
// cross-origin, the web page cannot read the username/password inside it. This content
// script never receives them either - the background only tells it "show the prompt";
// the iframe fetches the details from the background itself.

import { safeSend } from './dom';

const ATTR = 'data-vaultsync-prompt';
let frame: HTMLIFrameElement | null = null;

function extensionOrigin(): string {
  return new URL(chrome.runtime.getURL('')).origin;
}

function setStyles(el: HTMLElement, styles: Record<string, string>): void {
  // !important so the page's own CSS cannot hide or restyle the prompt.
  for (const [prop, value] of Object.entries(styles)) el.style.setProperty(prop, value, 'important');
}

export function showSavePrompt(): void {
  if (window.top !== window) return; // only the top frame hosts the prompt
  if (frame?.isConnected) {
    frame.src = chrome.runtime.getURL('src/prompt/prompt.html'); // reload with the newest offer
    return;
  }
  frame = document.createElement('iframe');
  frame.setAttribute(ATTR, '');
  frame.title = 'VaultSync - save password';
  frame.src = chrome.runtime.getURL('src/prompt/prompt.html');
  setStyles(frame, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    width: '400px',
    height: '400px',
    'max-width': 'calc(100vw - 24px)',
    border: '0',
    'border-radius': '16px',
    'box-shadow': '0 16px 48px rgba(0, 0, 0, 0.45)',
    'z-index': '2147483647',
    background: 'transparent',
    'color-scheme': 'normal',
    display: 'block',
    visibility: 'visible',
    opacity: '1',
  });
  (document.body ?? document.documentElement).append(frame);
}

function removePrompt(): void {
  frame?.remove();
  frame = null;
}

export function initSavePrompt(): void {
  if (window.top !== window) return;

  // Messages from the prompt iframe. Only trusted if they really come from our
  // extension origin AND from our iframe (a page cannot fake event.origin).
  window.addEventListener('message', (event) => {
    if (event.origin !== extensionOrigin() || !frame || event.source !== frame.contentWindow) return;
    const data = event.data as { type?: string; height?: number } | null;
    if (data?.type === 'vaultsync:close') removePrompt();
    if (data?.type === 'vaultsync:resize' && typeof data.height === 'number') {
      frame.style.setProperty('height', `${Math.min(Math.max(data.height, 120), 640)}px`, 'important');
    }
  });

  // The background asks us to show the prompt right away (SPA and iframe logins).
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string } | null)?.type === 'showSavePrompt') showSavePrompt();
  });

  // After a normal form login the page navigates; the offer is waiting for this tab.
  void safeSend<{ show: boolean }>({ type: 'hasSaveOffer' }).then((res) => {
    if (res?.show) showSavePrompt();
  });
}
