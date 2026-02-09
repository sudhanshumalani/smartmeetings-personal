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

export default function App() {
  const [ready, setReady] = useState(false);

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
