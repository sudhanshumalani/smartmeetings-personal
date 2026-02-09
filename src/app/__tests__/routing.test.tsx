import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db, initializeDatabase } from '../../db/database';
import { initialize as initSettings } from '../../services/settingsService';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { ToastProvider } from '../../contexts/ToastContext';
import { OnlineProvider } from '../../contexts/OnlineContext';
import Layout from '../../shared/components/Layout';
import MeetingListPage from '../../features/meetings/pages/MeetingListPage';
import MeetingDetailPage from '../../features/meetings/pages/MeetingDetailPage';
import StakeholderListPage from '../../features/stakeholders/pages/StakeholderListPage';
import StakeholderDetailPage from '../../features/stakeholders/pages/StakeholderDetailPage';
import SettingsPage from '../../features/settings/pages/SettingsPage';
import TrashPage from '../../features/settings/pages/TrashPage';

function renderWithRouter(initialRoute: string) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<MeetingListPage />} />
                <Route path="meetings/:id" element={<MeetingDetailPage />} />
                <Route path="stakeholders" element={<StakeholderListPage />} />
                <Route
                  path="stakeholders/:id"
                  element={<StakeholderDetailPage />}
                />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="trash" element={<TrashPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('Routing', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
  });

  it('should render MeetingListPage at /', async () => {
    renderWithRouter('/');
    expect(
      await screen.findByRole('heading', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /new meeting/i }),
    ).toBeInTheDocument();
  });

  it('should render MeetingDetailPage at /meetings/:id', async () => {
    renderWithRouter('/meetings/abc-123');
    // No meeting with this ID exists, so shows not-found
    expect(
      await screen.findByText('Meeting not found'),
    ).toBeInTheDocument();
  });

  it('should render StakeholderListPage at /stakeholders', async () => {
    renderWithRouter('/stakeholders');
    expect(
      await screen.findByRole('heading', { name: 'Stakeholders' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add Stakeholder/ }),
    ).toBeInTheDocument();
  });

  it('should render StakeholderDetailPage at /stakeholders/:id', async () => {
    renderWithRouter('/stakeholders/xyz-456');
    expect(
      await screen.findByText('Stakeholder not found'),
    ).toBeInTheDocument();
  });

  it('should render SettingsPage at /settings', async () => {
    renderWithRouter('/settings');
    expect(
      await screen.findByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
  });

  it('should render TrashPage at /trash', async () => {
    renderWithRouter('/trash');
    expect(
      await screen.findByRole('heading', { name: 'Trash' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trash is empty')).toBeInTheDocument();
  });

  it('should render the Layout nav bar on every route', async () => {
    renderWithRouter('/');
    // Wait for async page content to settle
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getByText('SmartMeetings')).toBeInTheDocument();
    // Scope to the nav element to avoid matching page-level links
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /stakeholders/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /trash/i })).toBeInTheDocument();
  });
});
