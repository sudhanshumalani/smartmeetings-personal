import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db, initializeDatabase } from '../../db/database';
import type { SyncQueueItem } from '../../db/database';
import { initialize as initSettings } from '../../services/settingsService';
import * as settingsService from '../../services/settingsService';
import { syncService } from '../syncService';
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
    it('throws when cloud sync not configured', async () => {
      await expect(syncService.pushChanges()).rejects.toThrow(
        'Cloud sync not configured',
      );
    });

    it('pushes pending items to Cloudflare Worker', async () => {
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-bearer-token');

      // Add 3 pending items
      await addSyncItem();
      await addSyncItem();
      await addSyncItem();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const result = await syncService.pushChanges();

      expect(result.synced).toBe(3);
      expect(result.failed).toBe(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Verify correct endpoint and auth header
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://worker.example.com/push');
      expect((options as RequestInit).method).toBe('POST');
      expect((options as RequestInit).headers).toEqual(
        expect.objectContaining({
          'Authorization': 'Bearer test-bearer-token',
          'Content-Type': 'application/json',
        }),
      );

      // All items should be marked as synced
      const items = await db.syncQueue.toArray();
      for (const item of items) {
        expect(item.syncedAt).not.toBeNull();
      }
    });

    it('marks syncQueue items as synced after successful push', async () => {
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-token');

      await addSyncItem();
      await addSyncItem();

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      await syncService.pushChanges();

      const items = await db.syncQueue.toArray();
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.syncedAt).toBeInstanceOf(Date);
      }
    });

    it('returns 0/0 when no pending items', async () => {
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-token');

      const result = await syncService.pushChanges();

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('skips already-synced items in count', async () => {
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-token');

      // Add one synced, one pending
      await addSyncItem({ syncedAt: new Date() });
      await addSyncItem();

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const result = await syncService.pushChanges();

      // Only 1 pending item
      expect(result.synced).toBe(1);
    });

    it('records errors when push fails', async () => {
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-token');

      await addSyncItem();

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Server error', { status: 500 }),
      );

      const result = await syncService.pushChanges();

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);

      const items = await db.syncQueue.toArray();
      expect(items[0].error).toBeTruthy();
    });
  });

  // --- pullData ---

  describe('pullData', () => {
    it('throws when cloud sync not configured', async () => {
      await expect(syncService.pullData()).rejects.toThrow(
        'Cloud sync not configured',
      );
    });

    it('pulls and imports data from Cloudflare Worker', async () => {
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-token');

      const mockData = {
        meetings: [
          {
            id: 'meeting-1',
            title: 'Pulled Meeting',
            date: new Date().toISOString(),
            participants: [],
            tags: [],
            stakeholderIds: [],
            status: 'draft',
            notes: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockData), { status: 200 }),
      );

      const result = await syncService.pullData();

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('returns 0/0 when no data on cloud', async () => {
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-token');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          meetings: [],
          stakeholders: [],
          stakeholderCategories: [],
          transcripts: [],
          meetingAnalyses: [],
        }), { status: 200 }),
      );

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
      await settingsService.saveCloudBackupUrl('https://worker.example.com');
      await settingsService.saveCloudBackupToken('test-token');
      await addSyncItem();

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      renderLayout();

      const btn = await screen.findByRole('button', { name: /sync/i });
      await userEvent.click(btn);

      await waitFor(() => {
        expect(screen.getByText(/Synced 1 changes/)).toBeInTheDocument();
      });
    });

    it('shows warning toast when sync not configured', async () => {
      await addSyncItem();

      // No cloud backup URL/token configured → throws
      renderLayout();

      const btn = await screen.findByRole('button', { name: /sync/i });
      await userEvent.click(btn);

      await waitFor(() => {
        expect(
          screen.getByText(/Set up Cloud Sync in Settings/),
        ).toBeInTheDocument();
      });
    });
  });
});
