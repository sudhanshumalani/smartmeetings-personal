import { db, type AppSettings, type ThemeMode } from '../db/database';
import { encrypt, decrypt } from './encryption';

/** Creates default AppSettings record if it doesn't exist. Call on app startup. */
export async function initialize(): Promise<void> {
  const existing = await db.appSettings.get('default');
  if (!existing) {
    await db.appSettings.add({
      id: 'default',
      claudeApiKey: '',
      assemblyaiApiKey: '',
      theme: 'system',
      googleClientId: '',
      encryptionKeyMaterial: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

/** Returns the current AppSettings record. */
export async function getSettings(): Promise<AppSettings> {
  const settings = await db.appSettings.get('default');
  if (!settings) {
    throw new Error('AppSettings not initialized. Call initialize() first.');
  }
  return settings;
}

/** Encrypts and stores the Claude API key. */
export async function saveClaudeApiKey(key: string): Promise<void> {
  const encrypted = key ? await encrypt(key) : '';
  await db.appSettings.update('default', {
    claudeApiKey: encrypted,
    updatedAt: new Date(),
  });
}

/** Decrypts and returns the Claude API key. Returns empty string if not set. */
export async function getClaudeApiKey(): Promise<string> {
  const settings = await getSettings();
  if (!settings.claudeApiKey) return '';
  return decrypt(settings.claudeApiKey);
}

/** Encrypts and stores the AssemblyAI API key. */
export async function saveAssemblyAiApiKey(key: string): Promise<void> {
  const encrypted = key ? await encrypt(key) : '';
  await db.appSettings.update('default', {
    assemblyaiApiKey: encrypted,
    updatedAt: new Date(),
  });
}

/** Decrypts and returns the AssemblyAI API key. Returns empty string if not set. */
export async function getAssemblyAiApiKey(): Promise<string> {
  const settings = await getSettings();
  if (!settings.assemblyaiApiKey) return '';
  return decrypt(settings.assemblyaiApiKey);
}

/** Stores the theme preference. */
export async function saveTheme(theme: ThemeMode): Promise<void> {
  await db.appSettings.update('default', {
    theme,
    updatedAt: new Date(),
  });
}

/** Stores the Google Client ID for Drive sync. */
export async function saveGoogleClientId(clientId: string): Promise<void> {
  await db.appSettings.update('default', {
    googleClientId: clientId,
    updatedAt: new Date(),
  });
}

/** Returns the stored Google Client ID. */
export async function getGoogleClientId(): Promise<string> {
  const settings = await getSettings();
  return settings.googleClientId || '';
}
