import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db/database';
import { CategoryRepository, CATEGORY_COLORS } from '../categoryRepository';

describe('CategoryRepository', () => {
  let repo: CategoryRepository;

  beforeEach(async () => {
    await db.stakeholderCategories.clear();
    await db.stakeholders.clear();
    await db.syncQueue.clear();
    repo = new CategoryRepository();
  });

  describe('CATEGORY_COLORS', () => {
    it('has 12 preset colors', () => {
      expect(CATEGORY_COLORS).toHaveLength(12);
    });

    it('all colors are valid hex codes', () => {
      for (const color of CATEGORY_COLORS) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  });

  describe('create', () => {
    it('creates a category with name and valid color', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });

      const category = await db.stakeholderCategories.get(id);
      expect(category).toBeDefined();
      expect(category!.name).toBe('Investors');
      expect(category!.color).toBe('#ef4444');
      expect(category!.deletedAt).toBeNull();
      expect(category!.createdAt).toBeInstanceOf(Date);
      expect(category!.updatedAt).toBeInstanceOf(Date);
    });

    it('rejects invalid color not in preset palette', async () => {
      await expect(repo.create({ name: 'Bad', color: '#000000' }))
        .rejects.toThrow('Invalid category color');
    });

    it('returns a valid UUID', async () => {
      const id = await repo.create({ name: 'Schools', color: '#3b82f6' });
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('accepts every color from the preset palette', async () => {
      for (const color of CATEGORY_COLORS) {
        const id = await repo.create({ name: `Cat-${color}`, color });
        const cat = await db.stakeholderCategories.get(id);
        expect(cat!.color).toBe(color);
      }
    });
  });

  describe('getAll', () => {
    it('returns non-deleted categories sorted by name', async () => {
      await repo.create({ name: 'Schools', color: '#3b82f6' });
      await repo.create({ name: 'Investors', color: '#ef4444' });
      await repo.create({ name: 'Partners', color: '#22c55e' });

      const all = await repo.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].name).toBe('Investors');
      expect(all[1].name).toBe('Partners');
      expect(all[2].name).toBe('Schools');
    });

    it('excludes soft-deleted categories', async () => {
      const id1 = await repo.create({ name: 'Investors', color: '#ef4444' });
      await repo.create({ name: 'Schools', color: '#3b82f6' });
      await repo.softDelete(id1);

      const all = await repo.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Schools');
    });
  });

  describe('getById', () => {
    it('returns category by id', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      const result = await repo.getById(id);
      expect(result).toBeDefined();
      expect(result!.name).toBe('Investors');
    });

    it('returns undefined for soft-deleted category', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      await repo.softDelete(id);
      expect(await repo.getById(id)).toBeUndefined();
    });

    it('returns undefined for non-existent id', async () => {
      expect(await repo.getById('no-such-id')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates name', async () => {
      const id = await repo.create({ name: 'Old Name', color: '#ef4444' });
      await repo.update(id, { name: 'New Name' });

      const category = await db.stakeholderCategories.get(id);
      expect(category!.name).toBe('New Name');
    });

    it('updates color with valid preset color', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      await repo.update(id, { color: '#3b82f6' });

      const category = await db.stakeholderCategories.get(id);
      expect(category!.color).toBe('#3b82f6');
    });

    it('rejects update with invalid color', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      await expect(repo.update(id, { color: '#ffffff' }))
        .rejects.toThrow('Invalid category color');
    });

    it('bumps updatedAt', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      const before = (await db.stakeholderCategories.get(id))!.updatedAt;

      await new Promise(r => setTimeout(r, 10));
      await repo.update(id, { name: 'Updated' });

      const after = (await db.stakeholderCategories.get(id))!.updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to a Date', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      await repo.softDelete(id);

      const category = await db.stakeholderCategories.get(id);
      expect(category!.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('permanentDelete', () => {
    it('removes category from database', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      await repo.permanentDelete(id);

      expect(await db.stakeholderCategories.get(id)).toBeUndefined();
    });

    it('removes category ID from stakeholders that reference it', async () => {
      const catId = await repo.create({ name: 'Investors', color: '#ef4444' });

      await db.stakeholders.add({
        id: 's1', name: 'Alice', categoryIds: [catId, 'other-cat'],
        createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      });

      await repo.permanentDelete(catId);

      const stakeholder = await db.stakeholders.get('s1');
      expect(stakeholder!.categoryIds).toEqual(['other-cat']);
    });

    it('handles stakeholders with only this category', async () => {
      const catId = await repo.create({ name: 'Investors', color: '#ef4444' });

      await db.stakeholders.add({
        id: 's1', name: 'Alice', categoryIds: [catId],
        createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      });

      await repo.permanentDelete(catId);

      const stakeholder = await db.stakeholders.get('s1');
      expect(stakeholder!.categoryIds).toEqual([]);
    });
  });

  describe('sync queue', () => {
    it('create queues a sync entry', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('stakeholderCategory');
      expect(entries[0].entityId).toBe(id);
      expect(entries[0].operation).toBe('create');
      expect(entries[0].syncedAt).toBeNull();
    });

    it('update queues an update sync entry', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      await db.syncQueue.clear();
      await repo.update(id, { name: 'Updated' });

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('update');
    });

    it('softDelete queues a delete sync entry', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });
      await db.syncQueue.clear();
      await repo.softDelete(id);

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('delete');
    });

    it('sync payload contains category data', async () => {
      const id = await repo.create({ name: 'Investors', color: '#ef4444' });

      const entries = await db.syncQueue.toArray();
      const payload = JSON.parse(entries[0].payload);
      expect(payload.id).toBe(id);
      expect(payload.name).toBe('Investors');
      expect(payload.color).toBe('#ef4444');
    });
  });
});
