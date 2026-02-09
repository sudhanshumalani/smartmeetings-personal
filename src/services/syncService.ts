import { db } from '../db/database';
import { googleDriveService } from './googleDriveService';
import { getGoogleClientId } from './settingsService';
import { exportAllData, importData } from './exportService';

export class SyncService {
  /** Manually triggered sync — export all data and upload to Google Drive */
  async pushChanges(): Promise<{ synced: number; failed: number }> {
    const clientId = await getGoogleClientId();
    if (!clientId) {
      throw new Error('Google Drive not configured. Set Client ID in Settings.');
    }

    if (!googleDriveService.isSignedIn()) {
      googleDriveService.initialize(clientId);
      await googleDriveService.requestAccessToken();
    }

    const pending = await db.syncQueue
      .filter((item) => item.syncedAt === null)
      .sortBy('createdAt');

    const data = await exportAllData();
    await googleDriveService.uploadBackup(data);

    // Mark all pending items as synced
    if (pending.length > 0) {
      await Promise.all(
        pending.map((item) =>
          db.syncQueue.update(item.id, { syncedAt: new Date() }),
        ),
      );
    }

    return { synced: pending.length, failed: 0 };
  }

  /** Pull latest data from Google Drive (for recovery / new device) */
  async pullData(): Promise<{ imported: number; skipped: number }> {
    const clientId = await getGoogleClientId();
    if (!clientId) {
      throw new Error('Google Drive not configured. Set Client ID in Settings.');
    }

    if (!googleDriveService.isSignedIn()) {
      googleDriveService.initialize(clientId);
      await googleDriveService.requestAccessToken();
    }

    const data = await googleDriveService.downloadBackup();
    if (!data) {
      return { imported: 0, skipped: 0 };
    }

    return importData(data);
  }

  /** Check sync status */
  async getStatus(): Promise<{
    pending: number;
    lastSynced: Date | null;
    errors: number;
  }> {
    const pending = await db.syncQueue
      .filter((i) => i.syncedAt === null && i.error === null)
      .count();
    const errors = await db.syncQueue
      .filter((i) => i.error !== null && i.syncedAt === null)
      .count();

    const synced = await db.syncQueue
      .filter((i) => i.syncedAt !== null)
      .reverse()
      .sortBy('syncedAt');

    return {
      pending,
      errors,
      lastSynced: synced[0]?.syncedAt ?? null,
    };
  }

  /** Get count of pending changes */
  async getPendingCount(): Promise<number> {
    return db.syncQueue.filter((i) => i.syncedAt === null).count();
  }
}

export const syncService = new SyncService();
