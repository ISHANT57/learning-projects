// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
//
// All cryptography uses the browser's built-in Web Crypto API - no third-party crypto.
//
//   master password --PBKDF2-SHA256 (600,000 iterations, random 16-byte salt)--> 256-bit key
//   JSON(vault)     --AES-256-GCM (random 12-byte IV per encryption)----------> ciphertext+tag
//
// AES-GCM is authenticated: if the key is wrong (wrong master password) or the data was
// tampered with, decryption fails instead of returning garbage. We use that failure to
// detect a wrong master password - no separate password hash is ever stored.

import { CRYPTO } from '../shared/constants';
import type { EncryptedBlob } from '../shared/types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong master password.');
    this.name = 'WrongPasswordError';
  }
}

export class CorruptVaultError extends Error {
  constructor(detail: string) {
    super(`The vault data is not valid: ${detail}`);
    this.name = 'CorruptVaultError';
  }
}

// ----------------------------------------------------------------------------- base64

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // avoid call-stack limits on large inputs
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
}

// ----------------------------------------------------------------------------- keys

/**
 * Derives the vault key from the master password.
 * SECURITY: the master password is only used here, in memory, and is never stored.
 * The key is marked extractable solely so it can be parked in chrome.storage.session
 * (RAM-only) while unlocked - see session.ts.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = CRYPTO.PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export async function importRawKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(b64), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

// ----------------------------------------------------------------------------- envelope

/** Encrypts any JSON value and returns the serialised envelope (base64 string). */
export async function encryptJson(
  key: CryptoKey,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  data: unknown,
): Promise<string> {
  // SECURITY: a fresh random IV for every encryption. Reusing an IV with the same
  // AES-GCM key would break confidentiality, so it is never reused.
  const iv = randomBytes(CRYPTO.IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data)),
  );
  const blob: EncryptedBlob = {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: toBase64(salt) },
    cipher: 'AES-256-GCM',
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
  };
  return toBase64(encoder.encode(JSON.stringify(blob)));
}

/** Parses and validates a serialised envelope (does not decrypt). */
export function parseBlob(serialized: string): EncryptedBlob {
  let blob: unknown;
  try {
    blob = JSON.parse(decoder.decode(fromBase64(serialized.trim())));
  } catch {
    throw new CorruptVaultError('not a VaultSync encrypted vault');
  }
  const b = blob as Partial<EncryptedBlob>;
  if (
    !b ||
    b.v !== 1 ||
    b.cipher !== 'AES-256-GCM' ||
    !b.kdf ||
    b.kdf.name !== 'PBKDF2-SHA256' ||
    typeof b.kdf.iterations !== 'number' ||
    b.kdf.iterations < 100_000 ||
    typeof b.kdf.salt !== 'string' ||
    typeof b.iv !== 'string' ||
    typeof b.ct !== 'string'
  ) {
    throw new CorruptVaultError('unsupported or damaged format');
  }
  if (fromBase64(b.iv).length !== CRYPTO.IV_BYTES) throw new CorruptVaultError('bad IV length');
  return b as EncryptedBlob;
}

export function saltOf(blob: EncryptedBlob): Uint8Array<ArrayBuffer> {
  return fromBase64(blob.kdf.salt);
}

/** Decrypts an envelope. A wrong key surfaces as WrongPasswordError (GCM tag mismatch). */
export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(blob.iv) },
      key,
      fromBase64(blob.ct),
    );
  } catch {
    throw new WrongPasswordError();
  }
  try {
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new CorruptVaultError('decrypted data is not JSON');
  }
}

/** Convenience: derive the key from a password for an existing envelope and decrypt it. */
export async function unlockBlob<T>(
  password: string,
  blob: EncryptedBlob,
): Promise<{ data: T; key: CryptoKey }> {
  const key = await deriveKey(password, saltOf(blob), blob.kdf.iterations);
  const data = await decryptJson<T>(key, blob);
  return { data, key };
}
