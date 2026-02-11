import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Listen for the vite-plugin-pwa custom event
    const handleSWUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.type === 'UPDATE_FOUND') {
        setNeedRefresh(true);
      }
    };

    // Check for waiting service worker on load
    navigator.serviceWorker.ready.then((reg) => {
      setRegistration(reg);
      if (reg.waiting) {
        setNeedRefresh(true);
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setNeedRefresh(true);
          }
        });
      });
    });

    window.addEventListener('sw-update', handleSWUpdate);
    return () => window.removeEventListener('sw-update', handleSWUpdate);
  }, []);

  function handleRefresh() {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }

  function handleDismiss() {
    setNeedRefresh(false);
  }

  if (!needRefresh) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-white shadow-lg sm:right-auto"
      role="alert"
      data-testid="pwa-update-prompt"
    >
      <RefreshCw size={18} />
      <span className="text-sm font-medium">
        New version available.
      </span>
      <button
        onClick={handleRefresh}
        className="rounded-md bg-white px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
      >
        Refresh
      </button>
      <button
        onClick={handleDismiss}
        className="text-sm text-blue-200 hover:text-white"
        aria-label="Dismiss update"
      >
        Later
      </button>
    </div>
  );
}
