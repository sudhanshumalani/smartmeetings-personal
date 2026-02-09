import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db, initializeDatabase } from '../../../db/database';
import type { Meeting } from '../../../db/database';
import { initialize as initSettings } from '../../../services/settingsService';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import { OnlineProvider } from '../../../contexts/OnlineContext';
import MeetingListPage from '../pages/MeetingListPage';

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route index element={<MeetingListPage />} />
              <Route
                path="meetings/:id"
                element={<div>MeetingDetailPage</div>}
              />
            </Routes>
          </MemoryRouter>
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  const id = crypto.randomUUID();
  const now = new Date();
  return {
    id,
    title: `Meeting ${id.slice(0, 4)}`,
    date: now,
    participants: [],
    tags: [],
    stakeholderIds: [],
    status: 'draft',
    notes: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('MeetingListPage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
  });

  it('renders empty state when no meetings', async () => {
    renderPage();
    expect(await screen.findByText('No meetings yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Create your first meeting/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/API keys in Settings/)).toBeInTheDocument();
  });

  it('quick-create creates meeting and navigates', async () => {
    renderPage();

    // Wait for page to be ready (empty state shows)
    await screen.findByText('No meetings yet');

    const newMeetingBtn = screen.getByRole('button', {
      name: /new meeting/i,
    });
    await userEvent.click(newMeetingBtn);

    // Should navigate to meeting detail
    expect(
      await screen.findByText('MeetingDetailPage'),
    ).toBeInTheDocument();

    // Meeting should exist in DB
    const meetings = await db.meetings.toArray();
    expect(meetings).toHaveLength(1);
    expect(meetings[0].status).toBe('draft');
  });

  it('meeting cards display correct info', async () => {
    // Create a category
    const catId = crypto.randomUUID();
    await db.stakeholderCategories.add({
      id: catId,
      name: 'Investors',
      color: '#ef4444',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // Create a stakeholder with that category
    const sId = crypto.randomUUID();
    await db.stakeholders.add({
      id: sId,
      name: 'John Doe',
      categoryIds: [catId],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // Create a meeting linked to that stakeholder
    await db.meetings.add(
      makeMeeting({
        title: 'Board Meeting',
        status: 'in-progress',
        tags: ['quarterly', 'finance'],
        participants: ['Alice', 'Bob', 'Charlie'],
        stakeholderIds: [sId],
      }),
    );

    renderPage();

    expect(await screen.findByText('Board Meeting')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Investors')).toBeInTheDocument();
    expect(screen.getByText('quarterly')).toBeInTheDocument();
    expect(screen.getByText('finance')).toBeInTheDocument();
    expect(screen.getByText('3 participants')).toBeInTheDocument();
  });

  it('search filters results correctly with debounce', async () => {
    await db.meetings.add(makeMeeting({ title: 'Alpha Conference' }));
    await db.meetings.add(makeMeeting({ title: 'Beta Workshop' }));

    renderPage();

    // Wait for both to appear
    expect(
      await screen.findByText('Alpha Conference'),
    ).toBeInTheDocument();
    expect(screen.getByText('Beta Workshop')).toBeInTheDocument();

    // Type in search
    const searchInput = screen.getByPlaceholderText('Search meetings...');
    await userEvent.type(searchInput, 'Alpha');

    // Wait for debounce + search results
    await waitFor(() => {
      expect(screen.getByText('Alpha Conference')).toBeInTheDocument();
      expect(
        screen.queryByText('Beta Workshop'),
      ).not.toBeInTheDocument();
    });
  });

  it('status filter works', async () => {
    await db.meetings.add(
      makeMeeting({ title: 'Draft Meeting', status: 'draft' }),
    );
    await db.meetings.add(
      makeMeeting({ title: 'Active Meeting', status: 'in-progress' }),
    );
    await db.meetings.add(
      makeMeeting({ title: 'Done Meeting', status: 'completed' }),
    );

    renderPage();

    // Wait for all to render
    expect(await screen.findByText('Draft Meeting')).toBeInTheDocument();
    expect(screen.getByText('Active Meeting')).toBeInTheDocument();
    expect(screen.getByText('Done Meeting')).toBeInTheDocument();

    // Open filter panel
    const filterBtn = screen.getByRole('button', { name: /^filter$/i });
    await userEvent.click(filterBtn);

    // Click "Completed" status filter
    const completedBtn = screen.getByRole('button', { name: 'Completed' });
    await userEvent.click(completedBtn);

    // Only completed meeting should show
    await waitFor(() => {
      expect(
        screen.queryByText('Draft Meeting'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Active Meeting'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Done Meeting')).toBeInTheDocument();
    });
  });

  it('date section grouping is correct', async () => {
    // Meeting with today's date (this week)
    await db.meetings.add(
      makeMeeting({ title: 'Today Meeting', date: new Date() }),
    );

    // Meeting in January 2026
    await db.meetings.add(
      makeMeeting({
        title: 'January Meeting',
        date: new Date('2026-01-10T12:00:00'),
      }),
    );

    // Meeting in December 2025
    await db.meetings.add(
      makeMeeting({
        title: 'December Meeting',
        date: new Date('2025-12-15T12:00:00'),
      }),
    );

    renderPage();

    expect(await screen.findByText('This Week')).toBeInTheDocument();
    expect(screen.getByText('January 2026')).toBeInTheDocument();
    expect(screen.getByText('December 2025')).toBeInTheDocument();
  });

  it('deleted meetings do not appear', async () => {
    await db.meetings.add(makeMeeting({ title: 'Visible Meeting' }));
    await db.meetings.add(
      makeMeeting({ title: 'Deleted Meeting', deletedAt: new Date() }),
    );

    renderPage();

    expect(
      await screen.findByText('Visible Meeting'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Deleted Meeting'),
    ).not.toBeInTheDocument();
  });
});
