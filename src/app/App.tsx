import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { initializeDatabase } from '../db/database';
import { initialize as initSettings } from '../services/settingsService';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ToastProvider } from '../contexts/ToastContext';
import { OnlineProvider } from '../contexts/OnlineContext';
import Layout from '../shared/components/Layout';
import Toast from '../shared/components/Toast';
import PWAUpdatePrompt from '../shared/components/PWAUpdatePrompt';
import MeetingListPage from '../features/meetings/pages/MeetingListPage';
import MeetingDetailPage from '../features/meetings/pages/MeetingDetailPage';
import StakeholderListPage from '../features/stakeholders/pages/StakeholderListPage';
import StakeholderDetailPage from '../features/stakeholders/pages/StakeholderDetailPage';
import SettingsPage from '../features/settings/pages/SettingsPage';
import TrashPage from '../features/settings/pages/TrashPage';
import ImportTranscriptionsPage from '../features/transcripts/pages/ImportTranscriptionsPage';
import MobileApp from '../features/mobile/MobileApp';
import useIsMobile from '../shared/hooks/useIsMobile';

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
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<MeetingListPage />} />
                <Route path="meetings/:id" element={<MeetingDetailPage />} />
                <Route path="stakeholders" element={<StakeholderListPage />} />
                <Route path="stakeholders/:id" element={<StakeholderDetailPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="trash" element={<TrashPage />} />
                <Route path="import" element={<ImportTranscriptionsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toast />
          <PWAUpdatePrompt />
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
