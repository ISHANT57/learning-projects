// @vitest-environment happy-dom
// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findStandaloneUsernameField,
  findUsernameField,
  isSubmitLike,
  pickPasswordField,
  setNativeValue,
} from '../../src/content/dom';
import { installChromeMock } from './chromeMock';

const visible = () => true; // happy-dom has no layout; visibility is tested in E2E
const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('username detection', () => {
  it('prefers autocomplete="username" over other text fields', () => {
    document.body.innerHTML = `<form>
      <input id="nick" type="text" name="nickname">
      <input id="user" type="text" autocomplete="username">
      <input id="pw" type="password"></form>`;
    expect(findUsernameField($('#pw'), visible)?.id).toBe('user');
  });

  it('then type="email", then name/id hints, then the nearest preceding input', () => {
    document.body.innerHTML = `<form><input id="a" type="text"><input id="mail" type="email"><input id="pw" type="password"></form>`;
    expect(findUsernameField($('#pw'), visible)?.id).toBe('mail');
    document.body.innerHTML = `<form><input id="x" type="text"><input id="login_id" name="login"><input id="pw" type="password"></form>`;
    expect(findUsernameField($('#pw'), visible)?.id).toBe('login_id');
    document.body.innerHTML = `<form><input id="first"><input id="second"><input id="pw" type="password"></form>`;
    expect(findUsernameField($('#pw'), visible)?.id).toBe('second');
  });

  it('ignores search boxes and fields after the password', () => {
    document.body.innerHTML = `<div><input id="search" name="q" placeholder="Search"><input id="pw" type="password"><input id="after" name="username"><button>Sign in</button></div>`;
    expect(findUsernameField($('#pw'), visible)).toBeNull();
  });

  it('finds the email field on step 1 of a multi-step login', () => {
    document.body.innerHTML = `<input name="q" placeholder="search"><input id="email" type="email"><button>Next</button>`;
    expect(findStandaloneUsernameField(document, visible)?.id).toBe('email');
  });
});

describe('password choice and submit detection', () => {
  const pw = (v: string) => Object.assign(document.createElement('input'), { type: 'password', value: v });

  it('picks the right password from sign-up / change-password forms', () => {
    expect(pickPasswordField([pw('a')])?.value).toBe('a');
    expect(pickPasswordField([pw('new'), pw('new')])?.value).toBe('new'); // password + confirm
    expect(pickPasswordField([pw('old'), pw('new')])?.value).toBe('new'); // current + new
    expect(pickPasswordField([pw('old'), pw('new'), pw('new')])?.value).toBe('new'); // current + new + confirm
    expect(pickPasswordField([pw('')])).toBeNull();
  });

  it('treats a "show password" button as NOT a submit', () => {
    document.body.innerHTML = `<form><button id="eye">Show</button><button id="go">Sign in</button><button id="sub" type="submit">→</button></form>`;
    expect(isSubmitLike($('#eye'))).toBe(false);
    expect(isSubmitLike($('#go'))).toBe(true);
    expect(isSubmitLike($('#sub'))).toBe(true);
  });
});

describe('native value setter', () => {
  it('sets the value and fires input + change for framework change detection', () => {
    document.body.innerHTML = `<input id="f">`;
    const input = $<HTMLInputElement>('#f');
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    setNativeValue(input, 'hello');
    expect(input.value).toBe('hello');
    expect(events).toEqual(['input', 'change']);
  });
});

describe('capture messages', () => {
  it('sends capture with username + password, and rememberUsername on step 1', async () => {
    const chromeMock = installChromeMock();
    const sendMessage = (chromeMock as unknown as { runtime: { sendMessage: ReturnType<typeof vi.fn> } }).runtime.sendMessage;
    vi.resetModules();
    const { captureFrom } = await import('../../src/content/formDetector');

    document.body.innerHTML = `<form id="login"><input name="email" type="email" value="me@x.com"><input type="password" value="pw123"></form>`;
    captureFrom($('#login'));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'capture', username: 'me@x.com', password: 'pw123' });

    sendMessage.mockClear();
    captureFrom($('#login')); // click + submit double-fire is de-duplicated
    expect(sendMessage).not.toHaveBeenCalled();

    document.body.innerHTML = `<form id="step1"><input type="email" value="me@x.com"><button>Next</button></form>`;
    captureFrom($('#step1'));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'rememberUsername', username: 'me@x.com' });
  });
});
