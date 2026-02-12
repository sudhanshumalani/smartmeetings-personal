import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { initializeDatabase } from '../db/database';
import { initialize as initSettings } from '../services/settingsService';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ToastProvider } from '../contexts/ToastContext';
import { OnlineProvider } from '../contexts/OnlineContext';
import Layout from '../shared/components/Layout';
import Toast from '../shared/components/Toast';
import PWAUpdatePrompt from '../shared/components/PWAUpdatePrompt';
import ErrorBoundary from '../shared/components/ErrorBoundary';
import MobileApp from '../features/mobile/MobileApp';
import useIsMobile from '../shared/hooks/useIsMobile';

const MeetingListPage = lazy(() => import('../features/meetings/pages/MeetingListPage'));
const MeetingDetailPage = lazy(() => import('../features/meetings/pages/MeetingDetailPage'));
const StakeholderListPage = lazy(() => import('../features/stakeholders/pages/StakeholderListPage'));
const StakeholderDetailPage = lazy(() => import('../features/stakeholders/pages/StakeholderDetailPage'));
const SettingsPage = lazy(() => import('../features/settings/pages/SettingsPage'));
const TrashPage = lazy(() => import('../features/settings/pages/TrashPage'));
const ImportTranscriptionsPage = lazy(() => import('../features/transcripts/pages/ImportTranscriptionsPage'));

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading...</span>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function init() {
      await initializeDatabase();
      await initSettings();
      setReady(true);
    }
    init();
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  // iOS devices get the dedicated mobile recording UI
  if (isMobile) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <OnlineProvider>
            <MobileApp />
            <Toast />
          </OnlineProvider>
        </ToastProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <BrowserRouter basename="/smartmeetings-personal">
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<ErrorBoundary><MeetingListPage /></ErrorBoundary>} />
                    <Route path="meetings/:id" element={<ErrorBoundary><MeetingDetailPage /></ErrorBoundary>} />
                    <Route path="stakeholders" element={<ErrorBoundary><StakeholderListPage /></ErrorBoundary>} />
                    <Route path="stakeholders/:id" element={<ErrorBoundary><StakeholderDetailPage /></ErrorBoundary>} />
                    <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
                    <Route path="trash" element={<ErrorBoundary><TrashPage /></ErrorBoundary>} />
                    <Route path="import" element={<ErrorBoundary><ImportTranscriptionsPage /></ErrorBoundary>} />
                  </Route>
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
          <Toast />
          <PWAUpdatePrompt />
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
