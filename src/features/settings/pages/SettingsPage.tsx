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
  Palette,
  Server,
  Brain,
  FileText,
} from 'lucide-react';
import {
  getClaudeApiKey,
  saveClaudeApiKey,
  getAssemblyAiApiKey,
  saveAssemblyAiApiKey,
  getGoogleClientId,
  saveGoogleClientId,
  getCloudBackupUrl,
  saveCloudBackupUrl,
  getCloudBackupToken,
  saveCloudBackupToken,
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
import { errorLogger } from '../../../services/errorLogger';
import PromptTemplateManager from '../components/PromptTemplateManager';
import MeetingTemplateManager from '../components/MeetingTemplateManager';


function SectionIcon({ icon: Icon, color }: { icon: typeof Key; color: string }) {
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}>
      <Icon size={16} className="text-white" />
    </div>
  );
}

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
  const [backingUp, setBackingUp] = useState(false);

  // Cloud Sync
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudUrlError, setCloudUrlError] = useState('');
  const [cloudUrlSaving, setCloudUrlSaving] = useState(false);
  const [cloudToken, setCloudToken] = useState('');
  const [cloudTokenSet, setCloudTokenSet] = useState(false);
  const [showCloudToken, setShowCloudToken] = useState(false);
  const [cloudTokenSaving, setCloudTokenSaving] = useState(false);
  const [cloudTesting, setCloudTesting] = useState(false);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [cloudRecovering, setCloudRecovering] = useState(false);
  const [cloudPushingAll, setCloudPushingAll] = useState(false);

  // Storage
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [storageLabel, setStorageLabel] = useState<string | null>(null);

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Diagnostics
  const [errorCount, setErrorCount] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [recentErrors, setRecentErrors] = useState<{ id: string; timestamp: Date; message: string; component: string | null }[]>([]);

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

        const savedCloudUrl = await getCloudBackupUrl();
        setCloudUrl(savedCloudUrl);
        const savedCloudToken = await getCloudBackupToken();
        setCloudToken(savedCloudToken);
        setCloudTokenSet(!!savedCloudToken);
        setCloudConfigured(!!savedCloudUrl && !!savedCloudToken);

        setDriveConnected(googleDriveService.isSignedIn());
      } catch {
        // Settings not ready yet
      }

      // Error count
      try {
        const count = await errorLogger.getCount();
        setErrorCount(count);
      } catch {
        // ignore
      }

      // Storage estimate
      if (navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const used = est.usage ?? 0;
          const quota = est.quota ?? 0;
          setStorageUsed(used);
          setStorageQuota(quota);
          const usedMB = (used / (1024 * 1024)).toFixed(1);
          const quotaMB = (quota / (1024 * 1024)).toFixed(0);
          setStorageLabel(`${usedMB} MB used of ${quotaMB} MB`);
        } catch {
          setStorageLabel('Unable to estimate');
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
      const data = await googleDriveService.downloadBackup();
      if (data) {
        const result = await importData(data);
        addToast(
          `Restored ${result.imported} records, skipped ${result.skipped} (older)`,
          'success',
        );
      } else {
        addToast('No backup found on Google Drive', 'warning');
      }
    } catch (err) {
      addToast(`Restore failed: ${(err as Error).message}`, 'error');
    }
    setRestoring(false);
  }

  async function handleBackupToDrive() {
    setBackingUp(true);
    try {
      const data = await exportAllData();
      await googleDriveService.uploadBackup(data);
      addToast('Backed up to Google Drive', 'success');
    } catch (err) {
      addToast(`Backup failed: ${(err as Error).message}`, 'error');
    }
    setBackingUp(false);
  }

  // --- Cloud Sync handlers ---

  async function handleSaveCloudUrl() {
    const trimmedUrl = cloudUrl.trim();
    if (trimmedUrl && !trimmedUrl.startsWith('https://')) {
      setCloudUrlError('URL must start with https://');
      return;
    }
    setCloudUrlError('');
    setCloudUrlSaving(true);
    try {
      await saveCloudBackupUrl(trimmedUrl);
      const hasToken = await getCloudBackupToken();
      setCloudConfigured(!!cloudUrl.trim() && !!hasToken);
      addToast('Cloud Sync URL saved', 'success');
    } catch {
      addToast('Failed to save Cloud Sync URL', 'error');
    }
    setCloudUrlSaving(false);
  }

  async function handleSaveCloudToken() {
    setCloudTokenSaving(true);
    try {
      await saveCloudBackupToken(cloudToken);
      setCloudTokenSet(!!cloudToken);
      const savedUrl = await getCloudBackupUrl();
      setCloudConfigured(!!savedUrl && !!cloudToken);
      setShowCloudToken(false);
      addToast(cloudToken ? 'Sync token saved' : 'Sync token removed', 'success');
    } catch {
      addToast('Failed to save sync token', 'error');
    }
    setCloudTokenSaving(false);
  }

  async function handleTestCloudConnection() {
    setCloudTesting(true);
    try {
      const result = await syncService.testConnection();
      const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
      const lastUpdated = result.lastUpdated
        ? new Date(result.lastUpdated).toLocaleString()
        : 'never';
      addToast(`Connection OK. ${total} records in cloud. Last updated: ${lastUpdated}`, 'success');
    } catch (err) {
      addToast(`Connection failed: ${(err as Error).message}`, 'error');
    }
    setCloudTesting(false);
  }

  async function handleRecoverFromCloud() {
    setCloudRecovering(true);
    try {
      const result = await syncService.pullData();
      addToast(
        `Recovered ${result.imported} records, skipped ${result.skipped} (older)`,
        'success',
      );
    } catch (err) {
      addToast(`Recovery failed: ${(err as Error).message}`, 'error');
    }
    setCloudRecovering(false);
  }

  async function handlePushAllToCloud() {
    setCloudPushingAll(true);
    try {
      const result = await syncService.pushAllData();
      if (result.failed === 0) {
        addToast(`Pushed ${result.synced} records to cloud`, 'success');
      } else {
        addToast(`Pushed ${result.synced}, ${result.failed} failed`, 'error');
      }
    } catch (err) {
      addToast(`Push failed: ${(err as Error).message}`, 'error');
    }
    setCloudPushingAll(false);
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

  // --- Diagnostics handlers ---

  async function handleExportDiagnostics() {
    try {
      const diagnostics = await errorLogger.exportDiagnostics();
      const date = new Date().toISOString().split('T')[0];
      downloadJson(diagnostics, `smartmeetings-diagnostics-${date}.json`);
      addToast('Diagnostics exported', 'success');
    } catch {
      addToast('Failed to export diagnostics', 'error');
    }
  }

  async function handleShowErrors() {
    if (showErrors) {
      setShowErrors(false);
      return;
    }
    const errors = await errorLogger.getRecent(20);
    setRecentErrors(errors);
    setShowErrors(true);
  }

  // --- Theme section ---

  const themeOptions: { mode: typeof theme; label: string; icon: typeof Sun }[] = [
    { mode: 'light', label: 'Light', icon: Sun },
    { mode: 'dark', label: 'Dark', icon: Moon },
    { mode: 'system', label: 'System', icon: Monitor },
  ];

  const storagePercent = storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Settings
      </h1>

      <div className="space-y-6">
        {/* --- API Keys --- */}
        <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <SectionIcon icon={Key} color="bg-gradient-to-br from-brand-500 to-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              API Keys
            </h2>
          </div>
          <div className="space-y-4 px-5 py-4">
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type={showClaudeKey ? 'text' : 'password'}
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    placeholder={claudeKeySet ? '••••••••••••' : 'sk-ant-...'}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-10 text-sm transition-colors focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:bg-gray-700"
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
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type={showAssemblyKey ? 'text' : 'password'}
                    value={assemblyKey}
                    onChange={(e) => setAssemblyKey(e.target.value)}
                    placeholder={assemblyKeySet ? '••••••••••••' : 'Enter AssemblyAI key'}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-10 text-sm transition-colors focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:bg-gray-700"
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
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
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
        <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <SectionIcon icon={Palette} color="bg-gradient-to-br from-amber-500 to-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Theme
            </h2>
          </div>
          <div className="px-5 py-4">
            <div className="flex gap-3">
              {themeOptions.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => setTheme(opt.mode)}
                  className={`flex flex-1 flex-col items-center gap-2 rounded-xl p-4 text-sm font-medium transition-all ${
                    theme === opt.mode
                      ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                  }`}
                  aria-label={`${opt.label} theme`}
                >
                  <opt.icon size={22} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* --- AI Prompt Templates --- */}
        <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <SectionIcon icon={Brain} color="bg-gradient-to-br from-purple-500 to-pink-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              AI Prompt Templates
            </h2>
          </div>
          <div className="px-5 py-4">
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Customize the AI analysis prompt for different meeting types. Use <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">{'${text}'}</code> where meeting content should be injected.
            </p>
            <PromptTemplateManager />
          </div>
        </section>

        {/* --- Meeting Templates --- */}
        <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <SectionIcon icon={FileText} color="bg-gradient-to-br from-teal-500 to-cyan-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Meeting Templates
            </h2>
          </div>
          <div className="px-5 py-4">
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Create templates to quickly start meetings with pre-filled tags, notes, and linked AI prompts.
            </p>
            <MeetingTemplateManager />
          </div>
        </section>

        {/* --- Google Drive Backup --- */}
        <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <SectionIcon icon={Cloud} color="bg-gradient-to-br from-sky-500 to-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Google Drive Backup
            </h2>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Google Client ID
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientIdState(e.target.value)}
                  placeholder="xxxxxxx.apps.googleusercontent.com"
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition-colors focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:bg-gray-700"
                  aria-label="Google Client ID"
                />
                <button
                  onClick={handleSaveGoogleClientId}
                  disabled={googleClientIdSaving}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
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
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
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
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <LogOut size={14} />
                  Disconnect
                </button>
              )}
              {driveConnected && (
                <>
                  <button
                    onClick={handleBackupToDrive}
                    disabled={backingUp}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                  >
                    {backingUp ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Upload size={14} />
                    )}
                    Backup to Drive
                  </button>
                  <button
                    onClick={handleRestoreFromDrive}
                    disabled={restoring}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {restoring ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Restore from Drive
                  </button>
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {testingConnection ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Cloud size={14} />
                    )}
                    Test Connection
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* --- Cloud Sync --- */}
        <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <SectionIcon icon={Server} color="bg-gradient-to-br from-indigo-500 to-violet-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Cloud Sync
            </h2>
          </div>
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your Cloudflare Worker URL and token to sync meetings across devices.
            </p>

            {/* Worker URL */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Worker URL
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={cloudUrl}
                  onChange={(e) => { setCloudUrl(e.target.value); setCloudUrlError(''); }}
                  placeholder="https://smartmeetings-sync.yourname.workers.dev"
                  className={`flex-1 rounded-lg border bg-gray-50 px-3 py-2 text-sm transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:bg-gray-700 dark:text-gray-100 dark:focus:bg-gray-700 ${cloudUrlError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 focus:border-brand-400 dark:border-gray-600'}`}
                  aria-label="Cloud Sync Worker URL"
                />
                <button
                  onClick={handleSaveCloudUrl}
                  disabled={cloudUrlSaving}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
                >
                  {cloudUrlSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Save
                </button>
              </div>
              {cloudUrlError && (
                <p className="mt-1 text-xs text-red-500">{cloudUrlError}</p>
              )}
            </div>

            {/* Sync Token */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sync Token
                </label>
                <span
                  className={`text-xs font-medium ${
                    cloudTokenSet
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400'
                  }`}
                >
                  {cloudTokenSet ? 'Configured' : 'Not set'}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type={showCloudToken ? 'text' : 'password'}
                    value={cloudToken}
                    onChange={(e) => setCloudToken(e.target.value)}
                    placeholder={cloudTokenSet ? '••••••••••••' : 'Enter sync token'}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-10 text-sm transition-colors focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:bg-gray-700"
                    aria-label="Cloud Sync Token"
                  />
                  <button
                    onClick={() => setShowCloudToken(!showCloudToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showCloudToken ? 'Hide token' : 'Show token'}
                    type="button"
                  >
                    {showCloudToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  onClick={handleSaveCloudToken}
                  disabled={cloudTokenSaving}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
                >
                  {cloudTokenSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Save
                </button>
              </div>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${cloudConfigured ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {cloudConfigured ? 'Cloud sync configured' : 'Not configured'}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleTestCloudConnection}
                disabled={cloudTesting || !cloudConfigured || !isOnline}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {cloudTesting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Server size={14} />
                )}
                Test Connection
              </button>
              <button
                onClick={handlePushAllToCloud}
                disabled={cloudPushingAll || !cloudConfigured || !isOnline}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {cloudPushingAll ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                Push All Data
              </button>
              <button
                onClick={handleRecoverFromCloud}
                disabled={cloudRecovering || !cloudConfigured || !isOnline}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {cloudRecovering ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                Recover from Cloud
              </button>
            </div>
          </div>
        </section>

        {/* --- Data Management (desktop only) --- */}
        {!isMobile && (
          <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <SectionIcon icon={HardDrive} color="bg-gradient-to-br from-emerald-500 to-teal-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Data Management
              </h2>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleExportAll}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                >
                  <Download size={16} />
                  Export All Data
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
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
              {storageLabel && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Storage</span>
                    <span className="text-xs text-gray-400">{storageLabel}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${Math.max(1, storagePercent)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- About --- */}
        <section className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <SectionIcon icon={Info} color="bg-gradient-to-br from-gray-500 to-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              About
            </h2>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                SmartMeetings v2.0
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Intelligent meeting notes with AI-powered analysis
              </p>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                All data is stored locally on your device. API keys and tokens are encrypted at rest.
                Cloud sync and Google Drive backup are optional and manually triggered.
              </p>
            </div>

            {/* Diagnostics */}
            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Diagnostics
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportDiagnostics}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Download size={14} />
                  Export Debug Info
                </button>
                <button
                  onClick={handleShowErrors}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {showErrors ? 'Hide Errors' : `View Errors (${errorCount})`}
                </button>
              </div>

              {showErrors && (
                <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50">
                  {recentErrors.length === 0 ? (
                    <p className="text-xs text-gray-400">No errors recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentErrors.map(err => (
                        <div key={err.id} className="text-xs">
                          <span className="text-gray-400">{err.timestamp.toLocaleString()}</span>
                          {err.component && <span className="ml-1 text-gray-500">[{err.component}]</span>}
                          <p className="text-gray-700 dark:text-gray-300">{err.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
