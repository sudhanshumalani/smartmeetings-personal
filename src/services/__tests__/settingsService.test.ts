import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db/database';
import {
  initialize,
  getSettings,
  saveClaudeApiKey,
  getClaudeApiKey,
  saveAssemblyAiApiKey,
  getAssemblyAiApiKey,
  saveTheme,
  saveGoogleClientId,
  getGoogleClientId,
} from '../settingsService';

describe('Settings Service', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe('initialize()', () => {
    it('should create default AppSettings record', async () => {
      await initialize();
      const settings = await db.appSettings.get('default');
      expect(settings).toBeDefined();
      expect(settings!.id).toBe('default');
      expect(settings!.theme).toBe('system');
      expect(settings!.claudeApiKey).toBe('');
      expect(settings!.assemblyaiApiKey).toBe('');
      expect(settings!.googleClientId).toBe('');
      expect(settings!.encryptionKeyMaterial).toBe('');
    });

    it('should be idempotent — second call does not overwrite', async () => {
      await initialize();
      const first = await db.appSettings.get('default');
      const firstCreatedAt = first!.createdAt;

      // Modify something
      await db.appSettings.update('default', { theme: 'dark' });

      // Initialize again
      await initialize();
      const second = await db.appSettings.get('default');

      // Should keep the modified value, not reset
      expect(second!.theme).toBe('dark');
      expect(second!.createdAt.getTime()).toBe(firstCreatedAt.getTime());
    });
  });

  describe('getSettings()', () => {
    it('should return AppSettings after initialization', async () => {
      await initialize();
      const settings = await getSettings();
      expect(settings.id).toBe('default');
      expect(settings.theme).toBe('system');
    });

    it('should throw if not initialized', async () => {
      await expect(getSettings()).rejects.toThrow(
        'AppSettings not initialized',
      );
    });
  });

  describe('Claude API key', () => {
    beforeEach(async () => {
      await initialize();
    });

    it('should save and retrieve Claude API key', async () => {
      const apiKey = 'sk-ant-api03-test-key-12345';
      await saveClaudeApiKey(apiKey);
      const retrieved = await getClaudeApiKey();
      expect(retrieved).toBe(apiKey);
    });

    it('should store key encrypted (not plaintext)', async () => {
      const apiKey = 'sk-ant-api03-plaintext-visible';
      await saveClaudeApiKey(apiKey);
      const settings = await db.appSettings.get('default');
      expect(settings!.claudeApiKey).not.toBe(apiKey);
      expect(settings!.claudeApiKey).not.toBe('');
    });

    it('should return empty string when no key is set', async () => {
      const key = await getClaudeApiKey();
      expect(key).toBe('');
    });

    it('should handle saving empty string', async () => {
      await saveClaudeApiKey('some-key');
      await saveClaudeApiKey('');
      const key = await getClaudeApiKey();
      expect(key).toBe('');
    });

    it('should handle updating an existing key', async () => {
      await saveClaudeApiKey('old-key');
      await saveClaudeApiKey('new-key');
      const key = await getClaudeApiKey();
      expect(key).toBe('new-key');
    });
  });

  describe('AssemblyAI API key', () => {
    beforeEach(async () => {
      await initialize();
    });

    it('should save and retrieve AssemblyAI API key', async () => {
      const apiKey = 'aai-test-key-67890';
      await saveAssemblyAiApiKey(apiKey);
      const retrieved = await getAssemblyAiApiKey();
      expect(retrieved).toBe(apiKey);
    });

    it('should store key encrypted (not plaintext)', async () => {
      const apiKey = 'aai-plaintext-visible';
      await saveAssemblyAiApiKey(apiKey);
      const settings = await db.appSettings.get('default');
      expect(settings!.assemblyaiApiKey).not.toBe(apiKey);
      expect(settings!.assemblyaiApiKey).not.toBe('');
    });

    it('should return empty string when no key is set', async () => {
      const key = await getAssemblyAiApiKey();
      expect(key).toBe('');
    });
  });

  describe('Theme', () => {
    beforeEach(async () => {
      await initialize();
    });

    it('should save and retrieve light theme', async () => {
      await saveTheme('light');
      const settings = await getSettings();
      expect(settings.theme).toBe('light');
    });

    it('should save and retrieve dark theme', async () => {
      await saveTheme('dark');
      const settings = await getSettings();
      expect(settings.theme).toBe('dark');
    });

    it('should save and retrieve system theme', async () => {
      await saveTheme('system');
      const settings = await getSettings();
      expect(settings.theme).toBe('system');
    });

    it('should update updatedAt when saving theme', async () => {
      const before = (await getSettings()).updatedAt;
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      await saveTheme('dark');
      const after = (await getSettings()).updatedAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('Google Client ID', () => {
    beforeEach(async () => {
      await initialize();
    });

    it('should save and retrieve Google Client ID', async () => {
      await saveGoogleClientId('test-id.apps.googleusercontent.com');
      const clientId = await getGoogleClientId();
      expect(clientId).toBe('test-id.apps.googleusercontent.com');
    });

    it('should return empty string when not set', async () => {
      const clientId = await getGoogleClientId();
      expect(clientId).toBe('');
    });

    it('should handle saving empty string', async () => {
      await saveGoogleClientId('some-id');
      await saveGoogleClientId('');
      const clientId = await getGoogleClientId();
      expect(clientId).toBe('');
    });
  });

  describe('End-to-end: multiple keys coexist', () => {
    it('should store and retrieve both API keys independently', async () => {
      await initialize();

      const claudeKey = 'sk-ant-claude-key';
      const assemblyKey = 'aai-assembly-key';

      await saveClaudeApiKey(claudeKey);
      await saveAssemblyAiApiKey(assemblyKey);

      expect(await getClaudeApiKey()).toBe(claudeKey);
      expect(await getAssemblyAiApiKey()).toBe(assemblyKey);
    });
  });
});
