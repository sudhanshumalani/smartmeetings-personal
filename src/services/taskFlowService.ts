import { db } from '../db/database';
import { getCloudBackupUrl, getCloudBackupToken } from './settingsService';

export interface TaskFlowPushResult {
  pushed: number;
  failed: number;
  errors: { taskId: string | null; error: string }[];
}

/** Push all confirmed (non-deleted) tasks to TaskFlow via Cloudflare Worker → Supabase */
export async function pushConfirmedTasks(): Promise<TaskFlowPushResult> {
  const url = await getCloudBackupUrl();
  const token = await getCloudBackupToken();
  if (!url || !token) {
    throw new Error('Cloud sync not configured. Set URL and token in Settings.');
  }

  const baseUrl = url.replace(/\/+$/, '');

  const tasks = await db.tasks.filter((t) => t.deletedAt === null).toArray();
  if (tasks.length === 0) {
    return { pushed: 0, failed: 0, errors: [] };
  }

  const payload = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    priority: t.priority,
    status: t.status,
    owner: t.owner,
    deadline: t.deadline,
    followUpTarget: t.followUpTarget,
    sourceMeetingTitle: t.sourceMeetingTitle,
    sourceMeetingId: t.meetingId,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  }));

  const response = await fetch(`${baseUrl}/taskflow/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ tasks: payload }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Push to TaskFlow failed (${response.status}): ${errBody}`);
  }

  return response.json() as Promise<TaskFlowPushResult>;
}
