// VaultSync - (c) 2026 IMPS. All rights reserved. Made by Ishant.
// Fingerprint: IMPS-VS-5FA22D0791658C41 - see LICENSE.
import { describe, expect, it } from 'vitest';
import {
  CorruptVaultError,
  WrongPasswordError,
  decryptJson,
  deriveKey,
  encryptJson,
  exportRawKey,
  fromBase64,
  importRawKey,
  parseBlob,
  randomBytes,
  toBase64,
  unlockBlob,
} from '../../src/background/crypto';
import { CRYPTO } from '../../src/shared/constants';

const FAST = 100_000; // minimum accepted iteration count, keeps most tests quick

describe('crypto', () => {
  it('base64 round-trips arbitrary bytes', () => {
    const bytes = randomBytes(1000);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('encrypts and decrypts with the real 600,000-iteration PBKDF2 key', async () => {
    const salt = randomBytes(CRYPTO.SALT_BYTES);
    const key = await deriveKey('correct horse battery staple', salt);
    const serialized = await encryptJson(key, salt, CRYPTO.PBKDF2_ITERATIONS, { hello: 'world' });
    const blob = parseBlob(serialized);
    expect(blob.kdf.iterations).toBe(600_000);
    expect(fromBase64(blob.kdf.salt)).toHaveLength(16);
    expect(fromBase64(blob.iv)).toHaveLength(12);
    expect(blob.cipher).toBe('AES-256-GCM');
    const { data } = await unlockBlob<{ hello: string }>('correct horse battery staple', blob);
    expect(data).toEqual({ hello: 'world' });
  });

  it('rejects a wrong password with WrongPasswordError', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('right password!!', salt, FAST);
    const blob = parseBlob(await encryptJson(key, salt, FAST, { a: 1 }));
    await expect(unlockBlob('wrong password!!', blob)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('uses a fresh random IV for every encryption', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('pw-pw-pw-pw-pw', salt, FAST);
    const a = parseBlob(await encryptJson(key, salt, FAST, { same: true }));
    const b = parseBlob(await encryptJson(key, salt, FAST, { same: true }));
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('detects tampering (GCM authentication)', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('pw-pw-pw-pw-pw', salt, FAST);
    const blob = parseBlob(await encryptJson(key, salt, FAST, { x: 'secret' }));
    const ct = fromBase64(blob.ct);
    ct[0] = ct[0]! ^ 0xff;
    await expect(decryptJson(key, { ...blob, ct: toBase64(ct) })).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('never leaves plaintext in the serialized envelope', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('pw-pw-pw-pw-pw', salt, FAST);
    const serialized = await encryptJson(key, salt, FAST, { password: 'SuperSecret#123' });
    const decoded = new TextDecoder().decode(fromBase64(serialized));
    expect(decoded).not.toContain('SuperSecret#123');
    expect(serialized).not.toContain('SuperSecret#123');
  });

  it('exports and re-imports the session key', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('pw-pw-pw-pw-pw', salt, FAST);
    const blob = parseBlob(await encryptJson(key, salt, FAST, { ok: 1 }));
    const restored = await importRawKey(await exportRawKey(key));
    await expect(decryptJson(restored, blob)).resolves.toEqual({ ok: 1 });
  });

  it('rejects garbage and weak KDF parameters', async () => {
    expect(() => parseBlob('not base64 json')).toThrow(CorruptVaultError);
    const weak = toBase64(
      new TextEncoder().encode(
        JSON.stringify({ v: 1, kdf: { name: 'PBKDF2-SHA256', iterations: 1000, salt: 'AA==' }, cipher: 'AES-256-GCM', iv: toBase64(randomBytes(12)), ct: 'AA==' }),
      ),
    );
    expect(() => parseBlob(weak)).toThrow(CorruptVaultError);
  });
});
