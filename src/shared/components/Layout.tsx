import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Settings,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  Wifi,
  WifiOff,
  CloudUpload,
  Loader2,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useOnline } from '../../contexts/OnlineContext';
import { useToast } from '../../contexts/ToastContext';
import { syncService } from '../../services/syncService';
import OfflineIndicator from './OfflineIndicator';

const navLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/stakeholders', label: 'Stakeholders', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/trash', label: 'Trash', icon: Trash2 },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const next = (): void => {
    const cycle: Record<string, 'light' | 'dark' | 'system'> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    };
    setTheme(cycle[theme]);
  };

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <button
      onClick={next}
      className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme}`}
    >
      <Icon size={18} />
    </button>
  );
}

function OnlineIndicator() {
  const { isOnline } = useOnline();
  const Icon = isOnline ? Wifi : WifiOff;

  return (
    <div
      className={`rounded-lg p-2 ${isOnline ? 'text-green-500' : 'text-yellow-500'}`}
      aria-label={isOnline ? 'Online' : 'Offline'}
      title={isOnline ? 'Online' : 'Offline'}
    >
      <Icon size={18} />
    </div>
  );
}

function SyncButton() {
  const { isOnline } = useOnline();
  const { addToast } = useToast();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await syncService.getPendingCount();
      setPendingCount(count);
    } catch {
      // Settings may not be initialized yet
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 5000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  async function handleSync() {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const result = await syncService.pushChanges();
      if (result.failed === 0) {
        addToast(`Synced ${result.synced} changes`, 'success');
      } else {
        addToast(
          `Synced ${result.synced}, ${result.failed} failed`,
          'error',
        );
      }
      await refreshCount();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      if (message.toLowerCase().includes('not configured')) {
        addToast('Sign in to Google Drive in Settings', 'warning');
      } else {
        addToast(message, 'error');
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      onClick={handleSync}
      className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={syncing ? 'Syncing...' : `Sync (${pendingCount} pending)`}
      title={syncing ? 'Syncing...' : `Sync to cloud (${pendingCount} pending)`}
      disabled={!isOnline || syncing}
    >
      {syncing ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <CloudUpload size={18} />
      )}
      {pendingCount > 0 && !syncing && (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
          data-testid="sync-badge"
        >
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}
    </button>
  );
}

const activeLinkClass =
  'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30';
const inactiveLinkClass =
  'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <OfflineIndicator />

      {/* Top Nav Bar */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          {/* Logo + App Name */}
          <NavLink to="/" className="flex items-center gap-2">
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              SmartMeetings
            </span>
          </NavLink>

          {/* Desktop Nav Links */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? activeLinkClass : inactiveLinkClass
                  }`
                }
              >
                <link.icon size={16} />
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side: Search placeholder + controls */}
          <div className="flex items-center gap-1">
            {/* SearchBar placeholder */}
            <div className="mr-2 hidden rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-400 dark:border-gray-600 md:block">
              Search...
            </div>

            <ThemeToggle />
            <OnlineIndicator />
            <SyncButton />

            {/* Mobile hamburger */}
            <button
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Menu */}
        {mobileMenuOpen && (
          <nav className="border-t border-gray-200 px-4 py-2 dark:border-gray-700 md:hidden">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? activeLinkClass : inactiveLinkClass
                  }`
                }
              >
                <link.icon size={16} />
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
