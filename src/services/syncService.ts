import { db, type SyncEntity } from '../db/database';
import { getCloudBackupUrl, getCloudBackupToken } from './settingsService';
import { importData, type ExportData } from './exportService';

const BATCH_SIZE = 50;

export class SyncService {
  /** Push pending syncQueue changes to Cloudflare D1 via Worker */
  async pushChanges(): Promise<{ synced: number; failed: number }> {
    const { url, token } = await this.getConfig();

    const pending = await db.syncQueue
      .filter((item) => item.syncedAt === null)
      .sortBy('createdAt');

    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const changes = batch.map((item) => ({
        entity: item.entity,
        entityId: item.entityId,
        operation: item.operation,
        payload: item.payload,
        timestamp: item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : String(item.createdAt),
      }));

      try {
        const response = await fetch(`${url}/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ changes }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Push failed (${response.status}): ${errBody}`);
        }

        // Mark batch items as synced
        await Promise.all(
          batch.map((item) =>
            db.syncQueue.update(item.id, { syncedAt: new Date() }),
          ),
        );
        synced += batch.length;
      } catch (err) {
        // Mark batch items with error, continue with next batch
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await Promise.all(
          batch.map((item) =>
            db.syncQueue.update(item.id, { error: errorMsg }),
          ),
        );
        failed += batch.length;
      }
    }

    return { synced, failed };
  }

  /** Pull data from Cloudflare D1 for recovery or incremental sync */
  async pullData(since?: string): Promise<{ imported: number; skipped: number }> {
    const { url, token } = await this.getConfig();

    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    const response = await fetch(`${url}/pull${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Pull failed (${response.status}): ${errBody}`);
    }

    const data = await response.json() as Record<string, unknown[]>;

    // Validate response has expected shape
    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      meetings: (data.meetings ?? []) as ExportData['meetings'],
      stakeholders: (data.stakeholders ?? []) as ExportData['stakeholders'],
      stakeholderCategories: (data.stakeholderCategories ?? []) as ExportData['stakeholderCategories'],
      transcripts: (data.transcripts ?? []) as ExportData['transcripts'],
      meetingAnalyses: (data.meetingAnalyses ?? []) as ExportData['meetingAnalyses'],
    };

    return importData(exportData);
  }

  /** Check local sync status + optional cloud health */
  async getStatus(): Promise<{
    pending: number;
    lastSynced: Date | null;
    errors: number;
    cloud?: { ok: boolean; counts: Record<string, number>; lastUpdated: string | null };
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

    const status: {
      pending: number;
      lastSynced: Date | null;
      errors: number;
      cloud?: { ok: boolean; counts: Record<string, number>; lastUpdated: string | null };
    } = {
      pending,
      errors,
      lastSynced: synced[0]?.syncedAt ?? null,
    };

    // Optionally fetch cloud status (non-fatal)
    try {
      const { url, token } = await this.getConfig();
      const response = await fetch(`${url}/status`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        status.cloud = await response.json() as typeof status.cloud;
      }
    } catch {
      // Cloud status is optional — ignore errors
    }

    return status;
  }

  /** Get count of pending changes */
  async getPendingCount(): Promise<number> {
    return db.syncQueue.filter((i) => i.syncedAt === null).count();
  }

  /** Push ALL local data to cloud (not just syncQueue — for initial sync or re-sync) */
  async pushAllData(): Promise<{ synced: number; failed: number }> {
    const { url, token } = await this.getConfig();

    // Collect all records from each table
    const tables: { entity: SyncEntity; getData: () => Promise<{ id: string; updatedAt?: Date | string }[]> }[] = [
      { entity: 'meeting', getData: () => db.meetings.toArray() },
      { entity: 'stakeholder', getData: () => db.stakeholders.toArray() },
      { entity: 'stakeholderCategory', getData: () => db.stakeholderCategories.toArray() },
      { entity: 'transcript', getData: () => db.transcripts.toArray() },
      { entity: 'meetingAnalysis', getData: () => db.meetingAnalyses.toArray() },
      { entity: 'task', getData: () => db.tasks.toArray() },
    ];

    const changes: { entity: string; entityId: string; operation: string; payload: string; timestamp: string }[] = [];

    for (const table of tables) {
      const records = await table.getData();
      for (const record of records) {
        const updatedAt = record.updatedAt
          ? new Date(record.updatedAt as string | Date).toISOString()
          : new Date().toISOString();
        changes.push({
          entity: table.entity,
          entityId: record.id,
          operation: 'update',
          payload: JSON.stringify(record),
          timestamp: updatedAt,
        });
      }
    }

    if (changes.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < changes.length; i += BATCH_SIZE) {
      const batch = changes.slice(i, i + BATCH_SIZE);
      try {
        const response = await fetch(`${url}/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ changes: batch }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Push failed (${response.status}): ${errBody}`);
        }
        synced += batch.length;
      } catch {
        failed += batch.length;
      }
    }

    return { synced, failed };
  }

  /** Test connection to Cloudflare Worker */
  async testConnection(): Promise<{ ok: boolean; counts: Record<string, number>; lastUpdated: string | null }> {
    const { url, token } = await this.getConfig();
    const response = await fetch(`${url}/status`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Connection failed (${response.status}): ${errBody}`);
    }

    return response.json() as Promise<{ ok: boolean; counts: Record<string, number>; lastUpdated: string | null }>;
  }

  private async getConfig(): Promise<{ url: string; token: string }> {
    const url = await getCloudBackupUrl();
    const token = await getCloudBackupToken();
    if (!url || !token) {
      throw new Error('Cloud sync not configured. Set URL and token in Settings.');
    }
    // Remove trailing slash
    return { url: url.replace(/\/+$/, ''), token };
  }
}

export const syncService = new SyncService();
