import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db, initializeDatabase } from '../../../db/database';
import { initialize as initSettings } from '../../../services/settingsService';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import { OnlineProvider } from '../../../contexts/OnlineContext';
import Toast from '../../../shared/components/Toast';
import TrashPage from '../pages/TrashPage';

function renderTrashPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <MemoryRouter initialEntries={['/trash']}>
            <Routes>
              <Route path="trash" element={<TrashPage />} />
            </Routes>
          </MemoryRouter>
          <Toast />
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

async function seedDeletedMeeting(title: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.meetings.add({
    id,
    title,
    date: now,
    participants: [],
    tags: [],
    stakeholderIds: [],
    status: 'draft',
    notes: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
  });
  return id;
}

async function seedDeletedStakeholder(name: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.stakeholders.add({
    id,
    name,
    categoryIds: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
  });
  return id;
}

async function seedDeletedCategory(name: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.stakeholderCategories.add({
    id,
    name,
    color: '#ef4444',
    createdAt: now,
    updatedAt: now,
    deletedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
  });
  return id;
}

describe('TrashPage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
  });

  it('shows empty state when no deleted items', async () => {
    renderTrashPage();

    expect(
      await screen.findByRole('heading', { name: 'Trash' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trash is empty')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Restore All/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Empty Trash/ }),
    ).not.toBeInTheDocument();
  });

  it('renders soft-deleted items from all entity types', async () => {
    await seedDeletedMeeting('Deleted Meeting');
    await seedDeletedStakeholder('Deleted Stakeholder');
    await seedDeletedCategory('Deleted Category');

    renderTrashPage();

    // Wait for items to load
    expect(await screen.findByText('Deleted Meeting')).toBeInTheDocument();
    expect(screen.getByText('Deleted Stakeholder')).toBeInTheDocument();
    expect(screen.getByText('Deleted Category')).toBeInTheDocument();

    // Section headers
    expect(screen.getByText('Meetings (1)')).toBeInTheDocument();
    expect(screen.getByText('Stakeholders (1)')).toBeInTheDocument();
    expect(screen.getByText('Categories (1)')).toBeInTheDocument();

    // Entity type badges
    expect(screen.getByText('Meeting')).toBeInTheDocument();
    expect(screen.getByText('Stakeholder')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();

    // Relative dates
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
    expect(screen.getByText('1 hour ago')).toBeInTheDocument();
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();

    // Bulk action buttons visible
    expect(
      screen.getByRole('button', { name: /Restore All/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Empty Trash/ }),
    ).toBeInTheDocument();

    // 3 trash items total
    expect(screen.getAllByTestId('trash-item')).toHaveLength(3);
  });

  it('does not show active (non-deleted) items', async () => {
    // Add an active meeting (no deletedAt)
    await db.meetings.add({
      id: crypto.randomUUID(),
      title: 'Active Meeting',
      date: new Date(),
      participants: [],
      tags: [],
      stakeholderIds: [],
      status: 'draft',
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await seedDeletedMeeting('Trashed Meeting');

    renderTrashPage();

    expect(await screen.findByText('Trashed Meeting')).toBeInTheDocument();
    expect(screen.queryByText('Active Meeting')).not.toBeInTheDocument();
  });

  it('restore moves item back to active', async () => {
    const meetingId = await seedDeletedMeeting('Meeting To Restore');

    renderTrashPage();

    const restoreBtn = await screen.findByRole('button', {
      name: 'Restore Meeting To Restore',
    });
    await userEvent.click(restoreBtn);

    // Item should disappear from trash
    await waitFor(() => {
      expect(
        screen.queryByText('Meeting To Restore'),
      ).not.toBeInTheDocument();
    });

    // Verify in DB: deletedAt should be null
    const meeting = await db.meetings.get(meetingId);
    expect(meeting?.deletedAt).toBeNull();

    // Should show empty state now
    expect(screen.getByText('Trash is empty')).toBeInTheDocument();
  });

  it('permanent delete removes item completely with confirmation', async () => {
    const meetingId = await seedDeletedMeeting('Meeting To Delete');

    // Also add related records to verify cascade
    await db.audioRecordings.add({
      id: crypto.randomUUID(),
      meetingId,
      blob: new Blob(['audio']),
      mimeType: 'audio/webm',
      duration: 10,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    renderTrashPage();

    const deleteBtn = await screen.findByRole('button', {
      name: 'Delete Meeting To Delete permanently',
    });
    await userEvent.click(deleteBtn);

    // Confirm dialog should appear
    expect(
      screen.getByText(/permanently delete "Meeting To Delete"/),
    ).toBeInTheDocument();

    // There are multiple "Delete" buttons — scope to the confirm dialog
    const dialog = screen
      .getByText(/permanently delete "Meeting To Delete"/)
      .closest('.fixed') as HTMLElement;
    const dialogConfirm = within(dialog).getAllByRole('button', {
      name: 'Delete',
    });
    await userEvent.click(dialogConfirm[0]);

    // Item should disappear
    await waitFor(() => {
      expect(
        screen.queryByText('Meeting To Delete'),
      ).not.toBeInTheDocument();
    });

    // Verify completely removed from DB
    const meeting = await db.meetings.get(meetingId);
    expect(meeting).toBeUndefined();

    // Cascade: audio recording should also be deleted
    const audioRecordings = await db.audioRecordings
      .where('meetingId')
      .equals(meetingId)
      .toArray();
    expect(audioRecordings).toHaveLength(0);
  });

  it('empty trash deletes all items with confirmation', async () => {
    const meetingId = await seedDeletedMeeting('Meeting 1');
    const stakeholderId = await seedDeletedStakeholder('Stakeholder 1');
    const categoryId = await seedDeletedCategory('Category 1');

    renderTrashPage();

    // Wait for items to load
    expect(await screen.findByText('Meeting 1')).toBeInTheDocument();

    // Click Empty Trash
    await userEvent.click(
      screen.getByRole('button', { name: /Empty Trash/ }),
    );

    // Confirm dialog
    expect(
      screen.getByText(/Permanently delete all 3 items/),
    ).toBeInTheDocument();

    // Click confirm (find the Delete button inside the dialog)
    const dialog = screen
      .getByText(/Permanently delete all 3 items/)
      .closest('.fixed') as HTMLElement;
    const confirmBtn = within(dialog).getByRole('button', {
      name: 'Delete',
    });
    await userEvent.click(confirmBtn);

    // All items should disappear
    await waitFor(() => {
      expect(screen.getByText('Trash is empty')).toBeInTheDocument();
    });

    // Verify DB is empty
    const meetings = await db.meetings.get(meetingId);
    expect(meetings).toBeUndefined();
    const stakeholder = await db.stakeholders.get(stakeholderId);
    expect(stakeholder).toBeUndefined();
    const category = await db.stakeholderCategories.get(categoryId);
    expect(category).toBeUndefined();
  });

  it('restore all restores every item with confirmation', async () => {
    const meetingId = await seedDeletedMeeting('Meeting R');
    const stakeholderId = await seedDeletedStakeholder('Stakeholder R');

    renderTrashPage();

    expect(await screen.findByText('Meeting R')).toBeInTheDocument();

    // Click Restore All
    await userEvent.click(
      screen.getByRole('button', { name: /Restore All/ }),
    );

    // Confirm dialog
    expect(screen.getByText(/Restore all 2 items/)).toBeInTheDocument();

    // Click confirm
    const dialog = screen
      .getByText(/Restore all 2 items/)
      .closest('.fixed') as HTMLElement;
    const confirmBtn = within(dialog).getByRole('button', {
      name: 'Restore All',
    });
    await userEvent.click(confirmBtn);

    // All items should disappear from trash
    await waitFor(() => {
      expect(screen.getByText('Trash is empty')).toBeInTheDocument();
    });

    // Verify in DB: both items restored
    const meeting = await db.meetings.get(meetingId);
    expect(meeting?.deletedAt).toBeNull();
    const stakeholder = await db.stakeholders.get(stakeholderId);
    expect(stakeholder?.deletedAt).toBeNull();
  });

  it('shows toast on restore', async () => {
    await seedDeletedStakeholder('Jane Doe');

    renderTrashPage();

    const restoreBtn = await screen.findByRole('button', {
      name: 'Restore Jane Doe',
    });
    await userEvent.click(restoreBtn);

    await waitFor(() => {
      expect(screen.getByText(/Restored "Jane Doe"/)).toBeInTheDocument();
    });
  });
});
