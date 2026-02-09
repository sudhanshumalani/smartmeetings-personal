import { useState, useEffect, useRef } from 'react';
import {
  Key,
  Sun,
  Moon,
  Monitor,
  Cloud,
  Download,
  Upload,
  HardDrive,
  Info,
  Eye,
  EyeOff,
  Check,
  Loader2,
  LogIn,
  LogOut,
} from 'lucide-react';
import {
  getClaudeApiKey,
  saveClaudeApiKey,
  getAssemblyAiApiKey,
  saveAssemblyAiApiKey,
  getGoogleClientId,
  saveGoogleClientId,
} from '../../../services/settingsService';
import { googleDriveService } from '../../../services/googleDriveService';
import { syncService } from '../../../services/syncService';
import { useTheme } from '../../../contexts/ThemeContext';
import { useToast } from '../../../contexts/ToastContext';
import { useOnline } from '../../../contexts/OnlineContext';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import {
  exportAllData,
  importData,
  validateImportData,
  downloadJson,
  type ExportData,
} from '../../../services/exportService';
import CategoryManager from '../../stakeholders/components/CategoryManager';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { addToast } = useToast();
  const { isOnline } = useOnline();
  const isMobile = useIsMobile();

  // API Keys
  const [claudeKey, setClaudeKey] = useState('');
  const [claudeKeySet, setClaudeKeySet] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [claudeSaving, setClaudeSaving] = useState(false);

  const [assemblyKey, setAssemblyKey] = useState('');
  const [assemblyKeySet, setAssemblyKeySet] = useState(false);
  const [showAssemblyKey, setShowAssemblyKey] = useState(false);
  const [assemblySaving, setAssemblySaving] = useState(false);

  // Google Drive
  const [googleClientId, setGoogleClientIdState] = useState('');
  const [googleClientIdSaving, setGoogleClientIdSaving] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Storage
  const [storageUsage, setStorageUsage] = useState<string | null>(null);

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Load initial values
  useEffect(() => {
    async function load() {
      try {
        const claudeApiKey = await getClaudeApiKey();
        setClaudeKeySet(!!claudeApiKey);

        const assemblyApiKey = await getAssemblyAiApiKey();
        setAssemblyKeySet(!!assemblyApiKey);

        const clientId = await getGoogleClientId();
        setGoogleClientIdState(clientId);

        setDriveConnected(googleDriveService.isSignedIn());
      } catch {
        // Settings not ready yet
      }

      // Storage estimate
      if (navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const usedMB = ((est.usage ?? 0) / (1024 * 1024)).toFixed(1);
          const quotaMB = ((est.quota ?? 0) / (1024 * 1024)).toFixed(0);
          setStorageUsage(`${usedMB} MB used of ${quotaMB} MB`);
        } catch {
          setStorageUsage('Unable to estimate');
        }
      }
    }
    load();
  }, []);

  // --- API Key handlers ---

  async function handleSaveClaudeKey() {
    setClaudeSaving(true);
    try {
      await saveClaudeApiKey(claudeKey);
      setClaudeKeySet(!!claudeKey);
      setClaudeKey('');
      setShowClaudeKey(false);
      addToast(claudeKey ? 'Claude API key saved' : 'Claude API key removed', 'success');
    } catch {
      addToast('Failed to save Claude API key', 'error');
    }
    setClaudeSaving(false);
  }

  async function handleSaveAssemblyKey() {
    setAssemblySaving(true);
    try {
      await saveAssemblyAiApiKey(assemblyKey);
      setAssemblyKeySet(!!assemblyKey);
      setAssemblyKey('');
      setShowAssemblyKey(false);
      addToast(assemblyKey ? 'AssemblyAI API key saved' : 'AssemblyAI API key removed', 'success');
    } catch {
      addToast('Failed to save AssemblyAI API key', 'error');
    }
    setAssemblySaving(false);
  }

  // --- Google Drive handlers ---

  async function handleSaveGoogleClientId() {
    setGoogleClientIdSaving(true);
    try {
      await saveGoogleClientId(googleClientId.trim());
      addToast('Google Client ID saved', 'success');
    } catch {
      addToast('Failed to save Google Client ID', 'error');
    }
    setGoogleClientIdSaving(false);
  }

  async function handleConnectDrive() {
    const clientId = googleClientId.trim();
    if (!clientId) {
      addToast('Enter a Google Client ID first', 'warning');
      return;
    }
    setDriveConnecting(true);
    try {
      googleDriveService.initialize(clientId);
      await googleDriveService.requestAccessToken();
      setDriveConnected(true);
      addToast('Connected to Google Drive', 'success');
    } catch (err) {
      addToast(`Google Drive connection failed: ${(err as Error).message}`, 'error');
    }
    setDriveConnecting(false);
  }

  function handleDisconnectDrive() {
    googleDriveService.signOut();
    setDriveConnected(false);
    addToast('Disconnected from Google Drive', 'info');
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    try {
      const info = await googleDriveService.getBackupInfo();
      if (info) {
        const date = new Date(info.lastModified).toLocaleString();
        addToast(`Connection OK. Last backup: ${date}`, 'success');
      } else {
        addToast('Connection OK. No backup found yet.', 'success');
      }
    } catch (err) {
      addToast(`Connection test failed: ${(err as Error).message}`, 'error');
    }
    setTestingConnection(false);
  }

  async function handleRestoreFromDrive() {
    setRestoring(true);
    try {
      const result = await syncService.pullData();
      addToast(
        `Restored ${result.imported} records, skipped ${result.skipped} (older)`,
        'success',
      );
    } catch (err) {
      addToast(`Restore failed: ${(err as Error).message}`, 'error');
    }
    setRestoring(false);
  }

  // --- Export/Import handlers ---

  async function handleExportAll() {
    try {
      const data = await exportAllData();
      const date = new Date().toISOString().split('T')[0];
      downloadJson(data, `smartmeetings-backup-${date}.json`);
      addToast('Data exported successfully', 'success');
    } catch {
      addToast('Failed to export data', 'error');
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        addToast('Invalid JSON file', 'error');
        setImporting(false);
        return;
      }

      const validationError = validateImportData(parsed);
      if (validationError) {
        addToast(`Import validation failed: ${validationError}`, 'error');
        setImporting(false);
        return;
      }

      const result = await importData(parsed as ExportData);
      addToast(
        `Imported ${result.imported} records, skipped ${result.skipped} (older)`,
        'success',
      );
    } catch {
      addToast('Failed to import data', 'error');
    }

    setImporting(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // --- Theme section ---

  const themeOptions: { mode: typeof theme; label: string; icon: typeof Sun }[] = [
    { mode: 'light', label: 'Light', icon: Sun },
    { mode: 'dark', label: 'Dark', icon: Moon },
    { mode: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Settings
      </h1>

      <div className="space-y-8">
        {/* --- API Keys --- */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Key size={20} />
            API Keys
          </h2>
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            {/* Claude API Key */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Claude API Key
                </label>
                <span
                  className={`text-xs font-medium ${
                    claudeKeySet
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400'
                  }`}
                  data-testid="claude-key-status"
                >
                  {claudeKeySet ? 'Configured' : 'Not set'}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showClaudeKey ? 'text' : 'password'}
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    placeholder={claudeKeySet ? '••••••••••••' : 'sk-ant-...'}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    aria-label="Claude API key"
                  />
                  <button
                    onClick={() => setShowClaudeKey(!showClaudeKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showClaudeKey ? 'Hide key' : 'Show key'}
                    type="button"
                  >
                    {showClaudeKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  onClick={handleSaveClaudeKey}
                  disabled={claudeSaving}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {claudeSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Save
                </button>
              </div>
            </div>

            {/* AssemblyAI API Key */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  AssemblyAI API Key
                </label>
                <span
                  className={`text-xs font-medium ${
                    assemblyKeySet
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400'
                  }`}
                  data-testid="assembly-key-status"
                >
                  {assemblyKeySet ? 'Configured' : 'Not set'}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showAssemblyKey ? 'text' : 'password'}
                    value={assemblyKey}
                    onChange={(e) => setAssemblyKey(e.target.value)}
                    placeholder={assemblyKeySet ? '••••••••••••' : 'Enter AssemblyAI key'}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    aria-label="AssemblyAI API key"
                  />
                  <button
                    onClick={() => setShowAssemblyKey(!showAssemblyKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showAssemblyKey ? 'Hide key' : 'Show key'}
                    type="button"
                  >
                    {showAssemblyKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  onClick={handleSaveAssemblyKey}
                  disabled={assemblySaving}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {assemblySaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* --- Theme --- */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Sun size={20} />
            Theme
          </h2>
          <div className="flex gap-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            {themeOptions.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => setTheme(opt.mode)}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg p-3 text-sm font-medium transition-colors ${
                  theme === opt.mode
                    ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
                aria-label={`${opt.label} theme`}
              >
                <opt.icon size={20} />
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* --- Categories --- */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Stakeholder Categories
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <CategoryManager />
          </div>
        </section>

        {/* --- Google Drive Backup --- */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Cloud size={20} />
            Google Drive Backup
          </h2>
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Google Client ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientIdState(e.target.value)}
                  placeholder="xxxxxxx.apps.googleusercontent.com"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  aria-label="Google Client ID"
                />
                <button
                  onClick={handleSaveGoogleClientId}
                  disabled={googleClientIdSaving}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {googleClientIdSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Save
                </button>
              </div>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${driveConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {driveConnected ? 'Connected to Google Drive' : 'Not connected'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {!driveConnected ? (
                <button
                  onClick={handleConnectDrive}
                  disabled={driveConnecting || !isOnline}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {driveConnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <LogIn size={14} />
                  )}
                  Connect Google Drive
                </button>
              ) : (
                <button
                  onClick={handleDisconnectDrive}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <LogOut size={14} />
                  Disconnect
                </button>
              )}
              {driveConnected && (
                <>
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {testingConnection ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Cloud size={14} />
                    )}
                    Test Connection
                  </button>
                  <button
                    onClick={handleRestoreFromDrive}
                    disabled={restoring}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {restoring ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Restore from Drive
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* --- Data Management (desktop only) --- */}
        {!isMobile && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              <HardDrive size={20} />
              Data Management
            </h2>
            <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleExportAll}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <Download size={16} />
                  Export All Data
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {importing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  Import Data
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  aria-label="Import file"
                />
              </div>
              {storageUsage && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Storage: {storageUsage}
                </p>
              )}
            </div>
          </section>
        )}

        {/* --- About --- */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Info size={20} />
            About
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              SmartMeetings v2.0
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Intelligent meeting notes with AI-powered analysis
            </p>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              All data is stored locally on your device. API keys are encrypted at rest.
              Google Drive backup is optional and manually triggered.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
