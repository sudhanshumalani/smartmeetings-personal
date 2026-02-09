import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db, initializeDatabase } from '../../db/database';
import type { SyncQueueItem } from '../../db/database';
import { initialize as initSettings } from '../../services/settingsService';
import * as settingsService from '../../services/settingsService';
import { syncService } from '../syncService';
import { googleDriveService } from '../googleDriveService';
import * as exportService from '../exportService';
import { meetingRepository } from '../meetingRepository';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { ToastProvider } from '../../contexts/ToastContext';
import { OnlineProvider } from '../../contexts/OnlineContext';
import Layout from '../../shared/components/Layout';
import Toast from '../../shared/components/Toast';

// --- Helpers ---

async function addSyncItem(overrides: Partial<SyncQueueItem> = {}): Promise<void> {
  const id = crypto.randomUUID();
  await db.syncQueue.add({
    id,
    entity: 'meeting',
    entityId: crypto.randomUUID(),
    operation: 'create',
    payload: JSON.stringify({ id: 'test', title: 'Test Meeting' }),
    createdAt: new Date(),
    syncedAt: null,
    error: null,
    ...overrides,
  });
}

function renderLayout() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<div>Home</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
          <Toast />
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('SyncService', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- pushChanges ---

  describe('pushChanges', () => {
    it('throws when Google Drive not configured (no client ID)', async () => {
      await expect(syncService.pushChanges()).rejects.toThrow(
        'Google Drive not configured',
      );
    });

    it('exports data and uploads to Google Drive', async () => {
      await settingsService.saveGoogleClientId('test-client-id.apps.googleusercontent.com');

      // Add 3 pending items
      await addSyncItem();
      await addSyncItem();
      await addSyncItem();

      const mockExportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      };

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(true);
      vi.spyOn(exportService, 'exportAllData').mockResolvedValue(mockExportData);
      const uploadSpy = vi.spyOn(googleDriveService, 'uploadBackup').mockResolvedValue();

      const result = await syncService.pushChanges();

      expect(result.synced).toBe(3);
      expect(result.failed).toBe(0);
      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect(uploadSpy).toHaveBeenCalledWith(mockExportData);

      // All items should be marked as synced
      const items = await db.syncQueue.toArray();
      for (const item of items) {
        expect(item.syncedAt).not.toBeNull();
      }
    });

    it('marks syncQueue items as synced after successful upload', async () => {
      await settingsService.saveGoogleClientId('test-client-id');

      await addSyncItem();
      await addSyncItem();

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(true);
      vi.spyOn(exportService, 'exportAllData').mockResolvedValue({
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      });
      vi.spyOn(googleDriveService, 'uploadBackup').mockResolvedValue();

      await syncService.pushChanges();

      const items = await db.syncQueue.toArray();
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.syncedAt).toBeInstanceOf(Date);
      }
    });

    it('initializes and requests token when not signed in', async () => {
      await settingsService.saveGoogleClientId('test-client-id');

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(false);
      const initSpy = vi.spyOn(googleDriveService, 'initialize').mockImplementation(() => {});
      const tokenSpy = vi.spyOn(googleDriveService, 'requestAccessToken').mockResolvedValue('token');
      vi.spyOn(exportService, 'exportAllData').mockResolvedValue({
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      });
      vi.spyOn(googleDriveService, 'uploadBackup').mockResolvedValue();

      await syncService.pushChanges();

      expect(initSpy).toHaveBeenCalledWith('test-client-id');
      expect(tokenSpy).toHaveBeenCalled();
    });

    it('returns 0/0 when no pending items', async () => {
      await settingsService.saveGoogleClientId('test-client-id');

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(true);
      vi.spyOn(exportService, 'exportAllData').mockResolvedValue({
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      });
      vi.spyOn(googleDriveService, 'uploadBackup').mockResolvedValue();

      const result = await syncService.pushChanges();

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('skips already-synced items in count', async () => {
      await settingsService.saveGoogleClientId('test-client-id');

      // Add one synced, one pending
      await addSyncItem({ syncedAt: new Date() });
      await addSyncItem();

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(true);
      vi.spyOn(exportService, 'exportAllData').mockResolvedValue({
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      });
      vi.spyOn(googleDriveService, 'uploadBackup').mockResolvedValue();

      const result = await syncService.pushChanges();

      // Only 1 pending item
      expect(result.synced).toBe(1);
    });
  });

  // --- pullData ---

  describe('pullData', () => {
    it('throws when Google Drive not configured', async () => {
      await expect(syncService.pullData()).rejects.toThrow(
        'Google Drive not configured',
      );
    });

    it('downloads and imports data from Google Drive', async () => {
      await settingsService.saveGoogleClientId('test-client-id');

      const mockData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [
          {
            id: 'meeting-1',
            title: 'Restored Meeting',
            date: new Date(),
            participants: [],
            tags: [],
            stakeholderIds: [],
            status: 'draft' as const,
            notes: '',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          },
        ],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      };

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'downloadBackup').mockResolvedValue(mockData);
      const importSpy = vi.spyOn(exportService, 'importData').mockResolvedValue({
        imported: 1,
        skipped: 0,
      });

      const result = await syncService.pullData();

      expect(importSpy).toHaveBeenCalledWith(mockData);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('returns 0/0 when no backup found on Drive', async () => {
      await settingsService.saveGoogleClientId('test-client-id');

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'downloadBackup').mockResolvedValue(null);

      const result = await syncService.pullData();

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  // --- getStatus ---

  describe('getStatus', () => {
    it('returns correct counts for pending, errors, lastSynced', async () => {
      // Add items in various states
      await addSyncItem(); // pending
      await addSyncItem(); // pending
      await addSyncItem({ syncedAt: new Date('2026-02-01T10:00:00Z') }); // synced
      await addSyncItem({ error: 'Failed' }); // error

      const status = await syncService.getStatus();

      expect(status.pending).toBe(2);
      expect(status.errors).toBe(1);
      expect(status.lastSynced).toBeInstanceOf(Date);
    });

    it('returns null lastSynced when nothing synced', async () => {
      await addSyncItem(); // pending only

      const status = await syncService.getStatus();

      expect(status.pending).toBe(1);
      expect(status.lastSynced).toBeNull();
    });

    it('returns all zeros when queue is empty', async () => {
      const status = await syncService.getStatus();

      expect(status.pending).toBe(0);
      expect(status.errors).toBe(0);
      expect(status.lastSynced).toBeNull();
    });
  });

  // --- getPendingCount ---

  describe('getPendingCount', () => {
    it('counts only unsynced items', async () => {
      await addSyncItem(); // pending
      await addSyncItem({ syncedAt: new Date() }); // synced
      await addSyncItem(); // pending

      const count = await syncService.getPendingCount();
      expect(count).toBe(2);
    });

    it('returns 0 when queue is empty', async () => {
      const count = await syncService.getPendingCount();
      expect(count).toBe(0);
    });
  });

  // --- Repository sync queue integration ---

  describe('Repository sync queue integration', () => {
    it('meetingRepository.quickCreate adds to syncQueue', async () => {
      const id = await meetingRepository.quickCreate();

      const items = await db.syncQueue.toArray();
      expect(items).toHaveLength(1);
      expect(items[0].entity).toBe('meeting');
      expect(items[0].entityId).toBe(id);
      expect(items[0].operation).toBe('create');
      expect(items[0].syncedAt).toBeNull();
    });

    it('meetingRepository.update adds to syncQueue', async () => {
      const id = await meetingRepository.quickCreate();
      await meetingRepository.update(id, { title: 'Updated' });

      const items = await db.syncQueue.orderBy('createdAt').toArray();
      expect(items).toHaveLength(2);
      expect(items[0].operation).toBe('create');
      expect(items[1].operation).toBe('update');
    });

    it('meetingRepository.softDelete adds delete to syncQueue', async () => {
      const id = await meetingRepository.quickCreate();
      await meetingRepository.softDelete(id);

      const items = await db.syncQueue.orderBy('createdAt').toArray();
      expect(items).toHaveLength(2);
      expect(items[0].operation).toBe('create');
      expect(items[1].operation).toBe('delete');
    });
  });

  // --- SyncButton component ---

  describe('SyncButton', () => {
    it('renders with sync icon', async () => {
      renderLayout();
      const btn = await screen.findByRole('button', { name: /sync/i });
      expect(btn).toBeInTheDocument();
    });

    it('shows pending count badge when items pending', async () => {
      await addSyncItem();
      await addSyncItem();
      await addSyncItem();

      renderLayout();

      await waitFor(() => {
        const badge = screen.getByTestId('sync-badge');
        expect(badge).toHaveTextContent('3');
      });
    });

    it('is disabled when offline', async () => {
      // Simulate offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      renderLayout();

      const btn = await screen.findByRole('button', { name: /sync/i });
      expect(btn).toBeDisabled();

      // Restore
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });
    });

    it('triggers sync on click and shows success toast', async () => {
      await settingsService.saveGoogleClientId('test-client-id');
      await addSyncItem();

      vi.spyOn(googleDriveService, 'isSignedIn').mockReturnValue(true);
      vi.spyOn(exportService, 'exportAllData').mockResolvedValue({
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      });
      vi.spyOn(googleDriveService, 'uploadBackup').mockResolvedValue();

      renderLayout();

      const btn = await screen.findByRole('button', { name: /sync/i });
      await userEvent.click(btn);

      await waitFor(() => {
        expect(screen.getByText(/Synced 1 changes/)).toBeInTheDocument();
      });
    });

    it('shows error toast when sync fails (not configured)', async () => {
      await addSyncItem();

      // No Google Client ID configured → throws
      renderLayout();

      const btn = await screen.findByRole('button', { name: /sync/i });
      await userEvent.click(btn);

      await waitFor(() => {
        expect(
          screen.getByText(/Sign in to Google Drive in Settings/),
        ).toBeInTheDocument();
      });
    });
  });
});
