import { db } from '../db/database';
import type { StakeholderCategory, SyncOperation } from '../db/database';

export const CATEGORY_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#6b7280', // gray
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export class CategoryRepository {
  async create(data: { name: string; color: string }): Promise<string> {
    if (!CATEGORY_COLORS.includes(data.color as CategoryColor)) {
      throw new Error(`Invalid category color: ${data.color}. Must be one of the preset palette.`);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    await db.stakeholderCategories.add({
      id,
      name: data.name,
      color: data.color,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.queueSync('create', id);
    return id;
  }

  async getAll(): Promise<StakeholderCategory[]> {
    return db.stakeholderCategories
      .filter(c => c.deletedAt === null)
      .sortBy('name');
  }

  async getById(id: string): Promise<StakeholderCategory | undefined> {
    const category = await db.stakeholderCategories.get(id);
    if (category?.deletedAt) return undefined;
    return category;
  }

  async update(id: string, changes: Partial<Pick<StakeholderCategory, 'name' | 'color'>>): Promise<void> {
    if (changes.color && !CATEGORY_COLORS.includes(changes.color as CategoryColor)) {
      throw new Error(`Invalid category color: ${changes.color}. Must be one of the preset palette.`);
    }

    await db.stakeholderCategories.update(id, { ...changes, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async softDelete(id: string): Promise<void> {
    await db.stakeholderCategories.update(id, { deletedAt: new Date(), updatedAt: new Date() });
    await this.queueSync('delete', id);
  }

  async restore(id: string): Promise<void> {
    await db.stakeholderCategories.update(id, { deletedAt: null, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async getDeleted(): Promise<StakeholderCategory[]> {
    return db.stakeholderCategories.filter(c => c.deletedAt !== null).toArray();
  }

  async permanentDelete(id: string): Promise<void> {
    await db.transaction('rw', [db.stakeholderCategories, db.stakeholders], async () => {
      // Remove this category ID from any stakeholders that reference it
      const stakeholders = await db.stakeholders
        .filter(s => s.categoryIds.includes(id))
        .toArray();

      for (const stakeholder of stakeholders) {
        await db.stakeholders.update(stakeholder.id, {
          categoryIds: stakeholder.categoryIds.filter(cid => cid !== id),
          updatedAt: new Date(),
        });
      }

      await db.stakeholderCategories.delete(id);
    });
  }

  private async queueSync(operation: SyncOperation, entityId: string): Promise<void> {
    const record = await db.stakeholderCategories.get(entityId);
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      entity: 'stakeholderCategory',
      entityId,
      operation,
      payload: JSON.stringify(record),
      createdAt: new Date(),
      syncedAt: null,
      error: null,
    });
  }
}

export const categoryRepository = new CategoryRepository();
