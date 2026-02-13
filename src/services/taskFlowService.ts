import { db } from '../db/database';
import { getCloudBackupUrl, getCloudBackupToken } from './settingsService';
import { taskRepository } from './taskRepository';

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

/** Push confirmed tasks to TaskFlow. When force=true, sends all; otherwise only new/changed tasks. */
export async function pushConfirmedTasks(force?: boolean): Promise<TaskFlowPushResult> {
  const url = await getCloudBackupUrl();
  const token = await getCloudBackupToken();
  if (!url || !token) {
    throw new Error('Cloud sync not configured. Set URL and token in Settings.');
  }

  const baseUrl = url.replace(/\/+$/, '');

  const allTasks = await db.tasks.filter((t) => t.deletedAt === null).toArray();
  const tasks = force
    ? allTasks
    : allTasks.filter(
        (t) =>
          t.taskFlowSyncedAt === null ||
          t.taskFlowSyncedAt === undefined ||
          t.updatedAt > t.taskFlowSyncedAt,
      );
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

  const result = await response.json() as TaskFlowPushResult;

  // Mark pushed tasks as synced when all succeeded
  if (result.failed === 0) {
    await taskRepository.markTaskFlowSynced(tasks.map((t) => t.id));
  }

  return result;
}

/** Sync stakeholders and categories to TaskFlow. If meetingIds provided, only sends those referenced by those meetings. */
export async function syncStakeholdersToTaskFlow(meetingIds?: string[]): Promise<TaskFlowSyncResult> {
  const url = await getCloudBackupUrl();
  const token = await getCloudBackupToken();
  if (!url || !token) {
    throw new Error('Cloud sync not configured. Set URL and token in Settings.');
  }

  const baseUrl = url.replace(/\/+$/, '');

  let stakeholders;
  let categories;

  if (meetingIds && meetingIds.length > 0) {
    // Scope to stakeholders referenced by the given meetings
    const meetings = await db.meetings.where('id').anyOf(meetingIds).toArray();
    const stakeholderIds = [...new Set(meetings.flatMap((m) => m.stakeholderIds ?? []))];
    stakeholders = stakeholderIds.length > 0
      ? await db.stakeholders.where('id').anyOf(stakeholderIds).filter((s) => s.deletedAt === null).toArray()
      : [];
    const categoryIds = [...new Set(stakeholders.flatMap((s) => s.categoryIds ?? []))];
    categories = categoryIds.length > 0
      ? await db.stakeholderCategories.where('id').anyOf(categoryIds).filter((c) => c.deletedAt === null).toArray()
      : [];
  } else {
    // Fallback: send all (force re-push mode)
    stakeholders = await db.stakeholders
      .filter((s) => s.deletedAt === null)
      .toArray();
    categories = await db.stakeholderCategories
      .filter((c) => c.deletedAt === null)
      .toArray();
  }

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
