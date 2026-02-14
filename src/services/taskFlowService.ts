import { db } from '../db/database';
import { getCloudBackupUrl, getCloudBackupToken } from './settingsService';
import { taskRepository } from './taskRepository';
import { stakeholderRepository } from './stakeholderRepository';
import { categoryRepository } from './categoryRepository';

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

  // Mark pushed tasks as synced when all succeeded, then archive them
  if (result.failed === 0) {
    await taskRepository.markTaskFlowSynced(tasks.map((t) => t.id));
    const archived = await taskRepository.archiveSynced();
    (result as TaskFlowPushResult & { archived?: number }).archived = archived;
  }

  return result;
}

function needsSync(entity: { taskFlowSyncedAt?: Date | null; updatedAt: Date }): boolean {
  return (
    entity.taskFlowSyncedAt === null ||
    entity.taskFlowSyncedAt === undefined ||
    entity.updatedAt > entity.taskFlowSyncedAt
  );
}

/** Sync stakeholders and categories to TaskFlow. When force=true, sends all; otherwise only new/changed. */
export async function syncStakeholdersToTaskFlow(force?: boolean): Promise<TaskFlowSyncResult> {
  const url = await getCloudBackupUrl();
  const token = await getCloudBackupToken();
  if (!url || !token) {
    throw new Error('Cloud sync not configured. Set URL and token in Settings.');
  }

  const baseUrl = url.replace(/\/+$/, '');

  const allStakeholders = await db.stakeholders
    .filter((s) => s.deletedAt === null)
    .toArray();
  const allCategories = await db.stakeholderCategories
    .filter((c) => c.deletedAt === null)
    .toArray();

  const stakeholders = force ? allStakeholders : allStakeholders.filter(needsSync);
  const categories = force ? allCategories : allCategories.filter(needsSync);

  if (stakeholders.length === 0 && categories.length === 0) {
    return { categoriesSynced: 0, projectsUpserted: 0, errors: [] };
  }

  // When pushing changed stakeholders, also include any categories they reference
  // (even if the category itself hasn't changed) so the Worker can resolve them
  if (!force && stakeholders.length > 0) {
    const referencedCategoryIds = new Set(stakeholders.flatMap((s) => s.categoryIds ?? []));
    for (const cat of allCategories) {
      if (referencedCategoryIds.has(cat.id) && !categories.some((c) => c.id === cat.id)) {
        categories.push(cat);
      }
    }
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

  const result = await response.json() as TaskFlowSyncResult;

  // Mark synced on success
  if (result.errors.length === 0) {
    if (stakeholders.length > 0) {
      await stakeholderRepository.markTaskFlowSynced(stakeholders.map((s) => s.id));
    }
    if (categories.length > 0) {
      await categoryRepository.markTaskFlowSynced(categories.map((c) => c.id));
    }
  }

  return result;
}

export interface TaskFlowCountsResult {
  tasks: number;
  projects: number;
  categories: number;
}

/**
 * Verify local sync status against remote TaskFlow counts.
 * If remote has fewer records than local expects, resets sync status so next push re-sends.
 * Returns a warning message if mismatch detected, null if all good.
 */
export async function verifyTaskFlowSync(): Promise<string | null> {
  const url = await getCloudBackupUrl();
  const token = await getCloudBackupToken();
  if (!url || !token) return null;

  const baseUrl = url.replace(/\/+$/, '');

  try {
    const response = await fetch(`${baseUrl}/taskflow/counts`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const remote = await response.json() as TaskFlowCountsResult;

    const localTasks = await db.tasks.filter((t) => t.deletedAt === null).count();
    const localStakeholders = await db.stakeholders.filter((s) => s.deletedAt === null).count();
    const localCategories = await db.stakeholderCategories.filter((c) => c.deletedAt === null).count();

    const mismatches: string[] = [];

    if (remote.tasks >= 0 && remote.tasks < localTasks) {
      await taskRepository.resetTaskFlowSync();
      mismatches.push(`tasks (remote: ${remote.tasks}, local: ${localTasks})`);
    }
    if (remote.projects >= 0 && remote.projects < localStakeholders) {
      await stakeholderRepository.resetTaskFlowSync();
      mismatches.push(`stakeholders (remote: ${remote.projects}, local: ${localStakeholders})`);
    }
    if (remote.categories >= 0 && remote.categories < localCategories) {
      await categoryRepository.resetTaskFlowSync();
      mismatches.push(`categories (remote: ${remote.categories}, local: ${localCategories})`);
    }

    if (mismatches.length > 0) {
      return `Sync mismatch detected: ${mismatches.join(', ')}. Sync status reset — push again to fix.`;
    }

    return null;
  } catch {
    return null;
  }
}
