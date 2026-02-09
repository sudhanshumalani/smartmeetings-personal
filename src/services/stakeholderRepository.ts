import { db } from '../db/database';
import type { Stakeholder, SyncOperation } from '../db/database';

export class StakeholderRepository {
  async create(data: Omit<Stakeholder, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.stakeholders.add({
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.queueSync('create', id);
    return id;
  }

  async getById(id: string): Promise<Stakeholder | undefined> {
    const stakeholder = await db.stakeholders.get(id);
    if (stakeholder?.deletedAt) return undefined;
    return stakeholder;
  }

  async getAll(): Promise<Stakeholder[]> {
    return db.stakeholders
      .filter(s => s.deletedAt === null)
      .sortBy('name');
  }

  async update(id: string, changes: Partial<Stakeholder>): Promise<void> {
    await db.stakeholders.update(id, { ...changes, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async softDelete(id: string): Promise<void> {
    await db.stakeholders.update(id, { deletedAt: new Date(), updatedAt: new Date() });
    await this.queueSync('delete', id);
  }

  async restore(id: string): Promise<void> {
    await db.stakeholders.update(id, { deletedAt: null, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async permanentDelete(id: string): Promise<void> {
    await db.transaction('rw', [db.stakeholders, db.meetings], async () => {
      // Remove this stakeholder's ID from any meetings that reference it
      const meetings = await db.meetings
        .filter(m => m.stakeholderIds.includes(id))
        .toArray();

      for (const meeting of meetings) {
        await db.meetings.update(meeting.id, {
          stakeholderIds: meeting.stakeholderIds.filter(sid => sid !== id),
          updatedAt: new Date(),
        });
      }

      await db.stakeholders.delete(id);
    });
  }

  async getDeleted(): Promise<Stakeholder[]> {
    return db.stakeholders.filter(s => s.deletedAt !== null).toArray();
  }

  async search(query: string): Promise<Stakeholder[]> {
    const lowerQuery = query.toLowerCase();
    return db.stakeholders
      .filter(s =>
        s.deletedAt === null && (
          s.name.toLowerCase().includes(lowerQuery) ||
          (s.organization?.toLowerCase().includes(lowerQuery) ?? false)
        )
      )
      .toArray();
  }

  async getByCategory(categoryId: string): Promise<Stakeholder[]> {
    return db.stakeholders
      .filter(s => s.deletedAt === null && s.categoryIds.includes(categoryId))
      .sortBy('name');
  }

  private async queueSync(operation: SyncOperation, entityId: string): Promise<void> {
    const record = await db.stakeholders.get(entityId);
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      entity: 'stakeholder',
      entityId,
      operation,
      payload: JSON.stringify(record),
      createdAt: new Date(),
      syncedAt: null,
      error: null,
    });
  }
}

export const stakeholderRepository = new StakeholderRepository();
