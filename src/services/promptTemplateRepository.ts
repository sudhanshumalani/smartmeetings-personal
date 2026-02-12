import { db } from '../db/database';
import type { PromptTemplate } from '../db/database';

class PromptTemplateRepository {
  async getAll(): Promise<PromptTemplate[]> {
    return db.promptTemplates
      .filter(t => t.deletedAt === null)
      .sortBy('createdAt');
  }

  async getById(id: string): Promise<PromptTemplate | undefined> {
    const t = await db.promptTemplates.get(id);
    if (t?.deletedAt) return undefined;
    return t;
  }

  async getDefault(): Promise<PromptTemplate | undefined> {
    return db.promptTemplates
      .filter(t => t.deletedAt === null && t.isDefault)
      .first();
  }

  async create(data: { name: string; content: string }): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    await db.promptTemplates.add({
      id,
      name: data.name,
      content: data.content,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return id;
  }

  async update(id: string, changes: Partial<Pick<PromptTemplate, 'name' | 'content'>>): Promise<void> {
    await db.promptTemplates.update(id, { ...changes, updatedAt: new Date() });
  }

  async setDefault(id: string): Promise<void> {
    await db.transaction('rw', db.promptTemplates, async () => {
      // Clear existing defaults
      const currentDefaults = await db.promptTemplates
        .filter(t => t.isDefault && t.deletedAt === null)
        .toArray();
      for (const t of currentDefaults) {
        await db.promptTemplates.update(t.id, { isDefault: false, updatedAt: new Date() });
      }
      // Set new default
      await db.promptTemplates.update(id, { isDefault: true, updatedAt: new Date() });
    });
  }

  async softDelete(id: string): Promise<void> {
    const template = await db.promptTemplates.get(id);
    if (template?.isDefault) {
      // If deleting the default, assign default to first remaining template
      const others = await db.promptTemplates
        .filter(t => t.id !== id && t.deletedAt === null)
        .sortBy('createdAt');
      if (others.length > 0) {
        await db.promptTemplates.update(others[0].id, { isDefault: true, updatedAt: new Date() });
      }
    }
    await db.promptTemplates.update(id, { deletedAt: new Date(), updatedAt: new Date() });
  }
}

export const promptTemplateRepository = new PromptTemplateRepository();
