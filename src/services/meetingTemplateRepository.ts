import { db } from '../db/database';
import type { MeetingTemplate } from '../db/database';

class MeetingTemplateRepository {
  async getAll(): Promise<MeetingTemplate[]> {
    return db.meetingTemplates
      .filter(t => t.deletedAt === null)
      .sortBy('createdAt');
  }

  async getById(id: string): Promise<MeetingTemplate | undefined> {
    const t = await db.meetingTemplates.get(id);
    if (t?.deletedAt) return undefined;
    return t;
  }

  async create(data: Omit<MeetingTemplate, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    await db.meetingTemplates.add({
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return id;
  }

  async update(id: string, changes: Partial<Pick<MeetingTemplate, 'name' | 'defaultTags' | 'defaultStakeholderIds' | 'defaultNotes' | 'promptTemplateId'>>): Promise<void> {
    await db.meetingTemplates.update(id, { ...changes, updatedAt: new Date() });
  }

  async softDelete(id: string): Promise<void> {
    await db.meetingTemplates.update(id, { deletedAt: new Date(), updatedAt: new Date() });
  }
}

export const meetingTemplateRepository = new MeetingTemplateRepository();
