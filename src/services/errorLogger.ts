import { db } from '../db/database';

class ErrorLogger {
  async log(
    message: string,
    stack?: string | null,
    component?: string | null,
    action?: string | null,
  ): Promise<void> {
    try {
      await db.errorLogs.add({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        message,
        stack: stack ?? null,
        component: component ?? null,
        action: action ?? null,
      });
    } catch {
      // Logging should never crash the app
      console.error('[ErrorLogger] Failed to persist error:', message);
    }
  }

  async getRecent(limit = 50): Promise<{ id: string; timestamp: Date; message: string; component: string | null }[]> {
    return db.errorLogs
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  }

  async getCount(): Promise<number> {
    return db.errorLogs.count();
  }

  async exportDiagnostics(): Promise<object> {
    const recentErrors = await this.getRecent(100);
    const meetingCount = await db.meetings.filter(m => m.deletedAt === null).count();
    const pendingSyncCount = await db.syncQueue.filter(s => s.syncedAt === null).count();

    let storageEstimate: { usage?: number; quota?: number } = {};
    if (navigator.storage?.estimate) {
      try {
        storageEstimate = await navigator.storage.estimate();
      } catch {
        // ignore
      }
    }

    return {
      appVersion: 'SmartMeetings v2.0',
      exportedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      onLine: navigator.onLine,
      storageUsedMB: storageEstimate.usage
        ? Number(((storageEstimate.usage) / (1024 * 1024)).toFixed(2))
        : null,
      storageQuotaMB: storageEstimate.quota
        ? Number(((storageEstimate.quota) / (1024 * 1024)).toFixed(0))
        : null,
      meetingCount,
      pendingSyncCount,
      recentErrors: recentErrors.map(e => ({
        timestamp: e.timestamp.toISOString(),
        message: e.message,
        component: e.component,
      })),
    };
  }

  async clear(): Promise<void> {
    await db.errorLogs.clear();
  }
}

export const errorLogger = new ErrorLogger();
