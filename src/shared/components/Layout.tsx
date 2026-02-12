import { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Settings,
  Trash2,
  Download,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  Wifi,
  WifiOff,
  CloudUpload,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useOnline } from '../../contexts/OnlineContext';
import { useToast } from '../../contexts/ToastContext';
import { syncService } from '../../services/syncService';
import { meetingRepository } from '../../services/meetingRepository';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';
import OfflineIndicator from './OfflineIndicator';

const navLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/stakeholders', label: 'Stakeholders', icon: Users },
  { to: '/import', label: 'Import', icon: Download },
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
      className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
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
      className={`rounded-lg p-2 ${isOnline ? 'text-green-500' : 'text-amber-500'}`}
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
        addToast('Set up Cloud Sync in Settings', 'warning');
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
      className="relative rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
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
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white"
          data-testid="sync-badge"
          aria-live="polite"
        >
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}
    </button>
  );
}

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const shortcutActions = useMemo(() => ({
    onNewMeeting: async () => {
      const id = await meetingRepository.quickCreate();
      navigate(`/meetings/${id}`);
    },
    onFocusSearch: () => {
      const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
      searchInput?.focus();
    },
  }), [navigate]);

  const { showHelp, setShowHelp } = useKeyboardShortcuts(shortcutActions);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <OfflineIndicator />

      {/* Top Nav Bar — Glassmorphism */}
      <header className="sticky top-0 z-40 border-b border-gray-200/60 bg-white/80 backdrop-blur-xl dark:border-gray-700/60 dark:bg-gray-800/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-4">
          {/* Logo + App Name */}
          <NavLink to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 shadow-sm">
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="text-base font-bold gradient-text sm:text-lg">
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
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                  }`
                }
              >
                <link.icon size={16} />
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side: controls */}
          <div className="flex items-center gap-0 sm:gap-0.5">
            <ThemeToggle />
            <OnlineIndicator />
            <SyncButton />

            {/* Mobile hamburger */}
            <button
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Menu */}
        {mobileMenuOpen && (
          <nav className="animate-slide-down border-t border-gray-200/60 px-4 py-2 dark:border-gray-700/60 md:hidden">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
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
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      {showHelp && <KeyboardShortcutsHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}
