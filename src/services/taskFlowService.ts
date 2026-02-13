import { db } from '../db/database';
import { getCloudBackupUrl, getCloudBackupToken } from './settingsService';

export interface TaskFlowSyncResult {
  categoriesSynced: number;
  projectsUpserted: number;
  errors: string[];
}

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

  // Collect unique meeting IDs and batch-fetch meetings, stakeholders, categories
  const meetingIds = [...new Set(tasks.map((t) => t.meetingId))];
  const meetings = await db.meetings.where('id').anyOf(meetingIds).toArray();
  const meetingMap = new Map(meetings.map((m) => [m.id, m]));

  const allStakeholderIds = [...new Set(meetings.flatMap((m) => m.stakeholderIds ?? []))];
  const stakeholders = allStakeholderIds.length > 0
    ? await db.stakeholders.where('id').anyOf(allStakeholderIds).toArray()
    : [];
  const stakeholderMap = new Map(stakeholders.map((s) => [s.id, s]));

  const allCategoryIds = [...new Set(stakeholders.flatMap((s) => s.categoryIds ?? []))];
  const categories = allCategoryIds.length > 0
    ? await db.stakeholderCategories.where('id').anyOf(allCategoryIds).toArray()
    : [];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const payload = tasks.map((t) => {
    const meeting = meetingMap.get(t.meetingId);
    const meetingStakeholders = (meeting?.stakeholderIds ?? [])
      .map((sid) => stakeholderMap.get(sid))
      .filter(Boolean);
    const stakeholderIds = meetingStakeholders.map((s) => s!.id);
    const stakeholderNames = meetingStakeholders.map((s) => s!.name);
    const stakeholderCategories = [
      ...new Set(
        meetingStakeholders.flatMap((s) =>
          (s!.categoryIds ?? []).map((cid) => categoryMap.get(cid)?.name).filter(Boolean)
        )
      ),
    ] as string[];

    return {
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
      stakeholderIds,
      stakeholderNames,
      stakeholderCategories,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
    };
  });

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

/** Sync all stakeholders and categories to TaskFlow so projects exist before tasks arrive */
export async function syncStakeholdersToTaskFlow(): Promise<TaskFlowSyncResult> {
  const url = await getCloudBackupUrl();
  const token = await getCloudBackupToken();
  if (!url || !token) {
    throw new Error('Cloud sync not configured. Set URL and token in Settings.');
  }

  const baseUrl = url.replace(/\/+$/, '');

  // Read all non-deleted stakeholders and categories from Dexie
  const stakeholders = await db.stakeholders
    .filter((s) => s.deletedAt === null)
    .toArray();
  const categories = await db.stakeholderCategories
    .filter((c) => c.deletedAt === null)
    .toArray();

  const payload = {
    stakeholders: stakeholders.map((s) => ({
      id: s.id,
      name: s.name,
      categoryIds: s.categoryIds ?? [],
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
    })),
  };

  const response = await fetch(`${baseUrl}/taskflow/sync-stakeholders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Stakeholder sync failed (${response.status}): ${errBody}`);
  }

  return response.json() as Promise<TaskFlowSyncResult>;
}
