import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db/database';
import { StakeholderRepository } from '../stakeholderRepository';

describe('StakeholderRepository', () => {
  let repo: StakeholderRepository;

  beforeEach(async () => {
    await db.stakeholders.clear();
    await db.stakeholderCategories.clear();
    await db.meetings.clear();
    await db.syncQueue.clear();
    repo = new StakeholderRepository();
  });

  describe('create', () => {
    it('creates a stakeholder with correct fields', async () => {
      const id = await repo.create({
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '555-1234',
        organization: 'Acme Corp',
        notes: 'Key investor',
        categoryIds: ['cat-1'],
      });

      const stakeholder = await db.stakeholders.get(id);
      expect(stakeholder).toBeDefined();
      expect(stakeholder!.name).toBe('Alice Smith');
      expect(stakeholder!.email).toBe('alice@example.com');
      expect(stakeholder!.phone).toBe('555-1234');
      expect(stakeholder!.organization).toBe('Acme Corp');
      expect(stakeholder!.notes).toBe('Key investor');
      expect(stakeholder!.categoryIds).toEqual(['cat-1']);
      expect(stakeholder!.deletedAt).toBeNull();
      expect(stakeholder!.createdAt).toBeInstanceOf(Date);
      expect(stakeholder!.updatedAt).toBeInstanceOf(Date);
    });

    it('creates stakeholder with minimal fields', async () => {
      const id = await repo.create({ name: 'Bob', categoryIds: [] });
      const stakeholder = await db.stakeholders.get(id);
      expect(stakeholder!.name).toBe('Bob');
      expect(stakeholder!.categoryIds).toEqual([]);
      expect(stakeholder!.email).toBeUndefined();
    });

    it('returns a valid UUID', async () => {
      const id = await repo.create({ name: 'Test', categoryIds: [] });
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('getById', () => {
    it('returns stakeholder by id', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      const result = await repo.getById(id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(id);
    });

    it('returns undefined for soft-deleted stakeholder', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.softDelete(id);
      expect(await repo.getById(id)).toBeUndefined();
    });

    it('returns undefined for non-existent id', async () => {
      expect(await repo.getById('no-such-id')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns non-deleted stakeholders sorted by name', async () => {
      await repo.create({ name: 'Charlie', categoryIds: [] });
      await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.create({ name: 'Bob', categoryIds: [] });

      const all = await repo.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].name).toBe('Alice');
      expect(all[1].name).toBe('Bob');
      expect(all[2].name).toBe('Charlie');
    });

    it('excludes soft-deleted stakeholders', async () => {
      const id1 = await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.create({ name: 'Bob', categoryIds: [] });
      await repo.softDelete(id1);

      const all = await repo.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Bob');
    });
  });

  describe('update', () => {
    it('updates specified fields', async () => {
      const id = await repo.create({ name: 'Alice', organization: 'Old Corp', categoryIds: [] });
      await repo.update(id, { name: 'Alice Updated', organization: 'New Corp' });

      const stakeholder = await db.stakeholders.get(id);
      expect(stakeholder!.name).toBe('Alice Updated');
      expect(stakeholder!.organization).toBe('New Corp');
    });

    it('bumps updatedAt', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      const before = (await db.stakeholders.get(id))!.updatedAt;

      await new Promise(r => setTimeout(r, 10));
      await repo.update(id, { name: 'Alice 2' });

      const after = (await db.stakeholders.get(id))!.updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to a Date', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.softDelete(id);

      const stakeholder = await db.stakeholders.get(id);
      expect(stakeholder!.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('clears deletedAt back to null', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.softDelete(id);
      await repo.restore(id);

      const stakeholder = await db.stakeholders.get(id);
      expect(stakeholder!.deletedAt).toBeNull();
    });

    it('makes stakeholder visible via getById again', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.softDelete(id);
      expect(await repo.getById(id)).toBeUndefined();

      await repo.restore(id);
      expect(await repo.getById(id)).toBeDefined();
    });
  });

  describe('permanentDelete', () => {
    it('removes stakeholder from database', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.permanentDelete(id);

      expect(await db.stakeholders.get(id)).toBeUndefined();
    });

    it('removes stakeholder ID from meetings that reference it', async () => {
      const stakeholderId = await repo.create({ name: 'Alice', categoryIds: [] });

      await db.meetings.add({
        id: 'm1', title: 'Meeting 1', date: new Date(),
        participants: [], tags: [], stakeholderIds: [stakeholderId, 'other-id'],
        status: 'draft', notes: '',
        createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      });

      await repo.permanentDelete(stakeholderId);

      const meeting = await db.meetings.get('m1');
      expect(meeting!.stakeholderIds).toEqual(['other-id']);
    });
  });

  describe('getDeleted', () => {
    it('returns only soft-deleted stakeholders', async () => {
      const id1 = await repo.create({ name: 'Deleted', categoryIds: [] });
      await repo.create({ name: 'Active', categoryIds: [] });
      await repo.softDelete(id1);

      const deleted = await repo.getDeleted();
      expect(deleted).toHaveLength(1);
      expect(deleted[0].name).toBe('Deleted');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await repo.create({ name: 'Alice Smith', organization: 'Acme Corp', categoryIds: [] });
      await repo.create({ name: 'Bob Jones', organization: 'Acme Corp', categoryIds: [] });
      await repo.create({ name: 'Charlie Brown', organization: 'Globex Inc', categoryIds: [] });
    });

    it('matches name', async () => {
      const results = await repo.search('alice');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice Smith');
    });

    it('matches organization', async () => {
      const results = await repo.search('acme');
      expect(results).toHaveLength(2);
    });

    it('is case insensitive', async () => {
      const results = await repo.search('GLOBEX');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Charlie Brown');
    });

    it('excludes soft-deleted stakeholders', async () => {
      const all = await repo.getAll();
      const alice = all.find(s => s.name === 'Alice Smith')!;
      await repo.softDelete(alice.id);

      const results = await repo.search('acme');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Bob Jones');
    });
  });

  describe('getByCategory', () => {
    it('returns stakeholders with the given categoryId', async () => {
      await repo.create({ name: 'Alice', categoryIds: ['cat-investors'] });
      await repo.create({ name: 'Bob', categoryIds: ['cat-schools', 'cat-investors'] });
      await repo.create({ name: 'Charlie', categoryIds: ['cat-schools'] });

      const investors = await repo.getByCategory('cat-investors');
      expect(investors).toHaveLength(2);
      // sorted by name
      expect(investors[0].name).toBe('Alice');
      expect(investors[1].name).toBe('Bob');
    });

    it('excludes soft-deleted stakeholders', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: ['cat-investors'] });
      await repo.create({ name: 'Bob', categoryIds: ['cat-investors'] });
      await repo.softDelete(id);

      const investors = await repo.getByCategory('cat-investors');
      expect(investors).toHaveLength(1);
      expect(investors[0].name).toBe('Bob');
    });

    it('returns empty array when no stakeholders match', async () => {
      await repo.create({ name: 'Alice', categoryIds: ['cat-investors'] });
      const result = await repo.getByCategory('cat-nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('multi-category', () => {
    it('stakeholder can have multiple categoryIds', async () => {
      const id = await repo.create({
        name: 'Alice',
        categoryIds: ['cat-investors', 'cat-partners', 'cat-schools'],
      });

      const stakeholder = await repo.getById(id);
      expect(stakeholder!.categoryIds).toEqual(['cat-investors', 'cat-partners', 'cat-schools']);
    });

    it('stakeholder appears in getByCategory for each of its categories', async () => {
      await repo.create({
        name: 'Alice',
        categoryIds: ['cat-investors', 'cat-partners'],
      });

      const investors = await repo.getByCategory('cat-investors');
      const partners = await repo.getByCategory('cat-partners');

      expect(investors).toHaveLength(1);
      expect(partners).toHaveLength(1);
      expect(investors[0].name).toBe('Alice');
      expect(partners[0].name).toBe('Alice');
    });
  });

  describe('sync queue', () => {
    it('create queues a sync entry', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].entity).toBe('stakeholder');
      expect(entries[0].entityId).toBe(id);
      expect(entries[0].operation).toBe('create');
      expect(entries[0].syncedAt).toBeNull();
    });

    it('update queues an update sync entry', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await db.syncQueue.clear();
      await repo.update(id, { name: 'Alice Updated' });

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('update');
    });

    it('softDelete queues a delete sync entry', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await db.syncQueue.clear();
      await repo.softDelete(id);

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('delete');
    });

    it('restore queues an update sync entry', async () => {
      const id = await repo.create({ name: 'Alice', categoryIds: [] });
      await repo.softDelete(id);
      await db.syncQueue.clear();
      await repo.restore(id);

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('update');
    });

    it('sync payload contains stakeholder data', async () => {
      const id = await repo.create({ name: 'Alice', organization: 'Acme', categoryIds: ['cat-1'] });

      const entries = await db.syncQueue.toArray();
      const payload = JSON.parse(entries[0].payload);
      expect(payload.id).toBe(id);
      expect(payload.name).toBe('Alice');
      expect(payload.organization).toBe('Acme');
    });
  });
});
