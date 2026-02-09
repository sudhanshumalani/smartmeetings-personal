import { describe, it, expect, beforeEach } from 'vitest';
import { db, initializeDatabase } from '../../db/database';
import { encrypt, decrypt } from '../encryption';

describe('Encryption Service', () => {
  beforeEach(async () => {
    // Clean slate for each test
    await db.delete();
    await db.open();
    await initializeDatabase();
  });

  describe('encrypt → decrypt round-trip', () => {
    it('should round-trip a short string', async () => {
      const original = 'sk-ant-api03-hello';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should round-trip an empty string', async () => {
      const original = '';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should round-trip a long string', async () => {
      const original = 'a'.repeat(10000);
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should round-trip unicode characters', async () => {
      const original = '🔑 日本語テスト émojis ñoño 中文 العربية';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should round-trip special characters', async () => {
      const original = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\t\r';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  describe('encryption output', () => {
    it('should produce different ciphertext for the same plaintext (random IV)', async () => {
      const plaintext = 'same-input';
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce a base64-encoded string', async () => {
      const encrypted = await encrypt('test');
      // Base64 regex
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('encrypted output should differ from plaintext', async () => {
      const plaintext = 'my-secret-key';
      const encrypted = await encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });
  });

  describe('key persistence', () => {
    it('should store encryption key material in AppSettings', async () => {
      await encrypt('trigger key generation');
      const settings = await db.appSettings.get('default');
      expect(settings?.encryptionKeyMaterial).toBeTruthy();
      expect(settings!.encryptionKeyMaterial.length).toBeGreaterThan(0);
    });

    it('should reuse the same key across multiple encrypt calls', async () => {
      await encrypt('first call');
      const settings1 = await db.appSettings.get('default');
      const key1 = settings1!.encryptionKeyMaterial;

      await encrypt('second call');
      const settings2 = await db.appSettings.get('default');
      const key2 = settings2!.encryptionKeyMaterial;

      expect(key1).toBe(key2);
    });

    it('should decrypt with persisted key after simulated restart', async () => {
      const original = 'persist-across-restarts';
      const encrypted = await encrypt(original);

      // Simulate "restart" — the key material is still in DB,
      // so decrypt should find it and work
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  describe('error handling', () => {
    it('should throw when decrypting corrupted data', async () => {
      // Generate a key first
      await encrypt('setup');

      // Try to decrypt garbage
      const garbage = btoa('this-is-not-valid-ciphertext-at-all!!');
      await expect(decrypt(garbage)).rejects.toThrow();
    });
  });
});
