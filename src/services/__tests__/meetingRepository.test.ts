import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db/database';
import { MeetingRepository } from '../meetingRepository';

describe('MeetingRepository', () => {
  let repo: MeetingRepository;

  beforeEach(async () => {
    // Clear all tables before each test
    await db.meetings.clear();
    await db.syncQueue.clear();
    await db.audioRecordings.clear();
    await db.transcripts.clear();
    await db.meetingAnalyses.clear();
    repo = new MeetingRepository();
  });

  describe('quickCreate', () => {
    it('creates a meeting with correct defaults', async () => {
      const id = await repo.quickCreate();

      const meeting = await db.meetings.get(id);
      expect(meeting).toBeDefined();
      expect(meeting!.status).toBe('draft');
      expect(meeting!.deletedAt).toBeNull();
      expect(meeting!.participants).toEqual([]);
      expect(meeting!.tags).toEqual([]);
      expect(meeting!.stakeholderIds).toEqual([]);
      expect(meeting!.notes).toBe('');
      expect(meeting!.title).toContain('Meeting —');
      expect(meeting!.createdAt).toBeInstanceOf(Date);
      expect(meeting!.updatedAt).toBeInstanceOf(Date);
    });

    it('generates an auto title with the current date', async () => {
      const id = await repo.quickCreate();
      const meeting = await db.meetings.get(id);
      const now = new Date();
      const expected = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      expect(meeting!.title).toBe(`Meeting — ${expected}`);
    });

    it('returns a valid UUID', async () => {
      const id = await repo.quickCreate();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('getById', () => {
    it('returns a meeting by id', async () => {
      const id = await repo.quickCreate();
      const meeting = await repo.getById(id);
      expect(meeting).toBeDefined();
      expect(meeting!.id).toBe(id);
    });

    it('returns undefined for soft-deleted meeting', async () => {
      const id = await repo.quickCreate();
      await repo.softDelete(id);
      const meeting = await repo.getById(id);
      expect(meeting).toBeUndefined();
    });

    it('returns undefined for non-existent id', async () => {
      const meeting = await repo.getById('non-existent-id');
      expect(meeting).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns non-deleted meetings sorted by date desc', async () => {
      // Create meetings with different dates
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const tomorrow = new Date(now.getTime() + 86400000);

      await db.meetings.add({
        id: 'old', title: 'Old', date: yesterday,
        participants: [], tags: [], stakeholderIds: [],
        status: 'draft', notes: '',
        createdAt: yesterday, updatedAt: yesterday, deletedAt: null,
      });
      await db.meetings.add({
        id: 'new', title: 'New', date: tomorrow,
        participants: [], tags: [], stakeholderIds: [],
        status: 'draft', notes: '',
        createdAt: tomorrow, updatedAt: tomorrow, deletedAt: null,
      });
      await db.meetings.add({
        id: 'mid', title: 'Mid', date: now,
        participants: [], tags: [], stakeholderIds: [],
        status: 'draft', notes: '',
        createdAt: now, updatedAt: now, deletedAt: null,
      });

      const meetings = await repo.getAll();
      expect(meetings).toHaveLength(3);
      // reverse().sortBy('date') returns newest first
      expect(meetings[0].id).toBe('new');
      expect(meetings[1].id).toBe('mid');
      expect(meetings[2].id).toBe('old');
    });

    it('excludes soft-deleted meetings', async () => {
      const id1 = await repo.quickCreate();
      const id2 = await repo.quickCreate();
      await repo.softDelete(id1);

      const meetings = await repo.getAll();
      expect(meetings).toHaveLength(1);
      expect(meetings[0].id).toBe(id2);
    });
  });

  describe('update', () => {
    it('updates specified fields', async () => {
      const id = await repo.quickCreate();
      await repo.update(id, { title: 'Updated Title', status: 'completed' });

      const meeting = await db.meetings.get(id);
      expect(meeting!.title).toBe('Updated Title');
      expect(meeting!.status).toBe('completed');
    });

    it('bumps updatedAt', async () => {
      const id = await repo.quickCreate();
      const before = (await db.meetings.get(id))!.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise(r => setTimeout(r, 10));
      await repo.update(id, { title: 'Changed' });

      const after = (await db.meetings.get(id))!.updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('queues a sync entry', async () => {
      const id = await repo.quickCreate();
      await db.syncQueue.clear(); // clear the create sync entry
      await repo.update(id, { title: 'Changed' });

      const syncEntries = await db.syncQueue.toArray();
      expect(syncEntries).toHaveLength(1);
      expect(syncEntries[0].entity).toBe('meeting');
      expect(syncEntries[0].entityId).toBe(id);
      expect(syncEntries[0].operation).toBe('update');
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to a Date', async () => {
      const id = await repo.quickCreate();
      await repo.softDelete(id);

      const meeting = await db.meetings.get(id);
      expect(meeting!.deletedAt).toBeInstanceOf(Date);
    });

    it('queues a sync entry with delete operation', async () => {
      const id = await repo.quickCreate();
      await db.syncQueue.clear();
      await repo.softDelete(id);

      const syncEntries = await db.syncQueue.toArray();
      expect(syncEntries).toHaveLength(1);
      expect(syncEntries[0].operation).toBe('delete');
    });
  });

  describe('restore', () => {
    it('clears deletedAt back to null', async () => {
      const id = await repo.quickCreate();
      await repo.softDelete(id);

      // Verify it was soft-deleted
      let meeting = await db.meetings.get(id);
      expect(meeting!.deletedAt).not.toBeNull();

      await repo.restore(id);

      meeting = await db.meetings.get(id);
      expect(meeting!.deletedAt).toBeNull();
    });

    it('makes meeting visible via getById again', async () => {
      const id = await repo.quickCreate();
      await repo.softDelete(id);
      expect(await repo.getById(id)).toBeUndefined();

      await repo.restore(id);
      expect(await repo.getById(id)).toBeDefined();
    });
  });

  describe('permanentDelete', () => {
    it('removes meeting from database', async () => {
      const id = await repo.quickCreate();
      await repo.permanentDelete(id);

      const meeting = await db.meetings.get(id);
      expect(meeting).toBeUndefined();
    });

    it('cascades to audioRecordings, transcripts, and meetingAnalyses', async () => {
      const id = await repo.quickCreate();

      // Add related records
      await db.audioRecordings.add({
        id: 'ar-1', meetingId: id, blob: new Blob(), mimeType: 'audio/webm',
        duration: 60, order: 1, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      });
      await db.transcripts.add({
        id: 't-1', meetingId: id, audioRecordingId: 'ar-1',
        assemblyaiTranscriptId: 'aai-1', utterances: [], fullText: 'test',
        speakerMap: {}, audioDuration: 60, overallConfidence: 0.9,
        createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      });
      await db.meetingAnalyses.add({
        id: 'ma-1', meetingId: id, summary: 'test', themes: [],
        decisions: [], actionItems: [], openItems: [], nextSteps: '',
        sourceType: 'api', inputText: 'test',
        createdAt: new Date(), deletedAt: null,
      });

      // Also add records for a DIFFERENT meeting to ensure they survive
      await db.audioRecordings.add({
        id: 'ar-other', meetingId: 'other-meeting', blob: new Blob(), mimeType: 'audio/webm',
        duration: 30, order: 1, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      });

      await repo.permanentDelete(id);

      // Related records for this meeting should be gone
      expect(await db.audioRecordings.get('ar-1')).toBeUndefined();
      expect(await db.transcripts.get('t-1')).toBeUndefined();
      expect(await db.meetingAnalyses.get('ma-1')).toBeUndefined();
      expect(await db.meetings.get(id)).toBeUndefined();

      // Other meeting's records should still exist
      expect(await db.audioRecordings.get('ar-other')).toBeDefined();
    });
  });

  describe('getDeleted', () => {
    it('returns only soft-deleted meetings', async () => {
      const id1 = await repo.quickCreate();
      await repo.quickCreate(); // not deleted
      await repo.softDelete(id1);

      const deleted = await repo.getDeleted();
      expect(deleted).toHaveLength(1);
      expect(deleted[0].id).toBe(id1);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await db.meetings.bulkAdd([
        {
          id: 's1', title: 'Budget Review', date: new Date(),
          participants: ['Alice', 'Bob'], tags: ['finance', 'quarterly'],
          stakeholderIds: [], status: 'completed', notes: 'Discussed Q4 expenses',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        },
        {
          id: 's2', title: 'Sprint Planning', date: new Date(),
          participants: ['Charlie'], tags: ['engineering'],
          stakeholderIds: [], status: 'draft', notes: 'Plan for next sprint',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        },
        {
          id: 's3', title: 'Deleted Meeting', date: new Date(),
          participants: ['Alice'], tags: ['finance'],
          stakeholderIds: [], status: 'draft', notes: 'Should not appear',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: new Date(),
        },
      ]);
    });

    it('matches title', async () => {
      const results = await repo.search('budget');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s1');
    });

    it('matches notes', async () => {
      const results = await repo.search('expenses');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s1');
    });

    it('matches participants', async () => {
      const results = await repo.search('alice');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s1');
    });

    it('matches tags', async () => {
      const results = await repo.search('engineering');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s2');
    });

    it('excludes soft-deleted meetings', async () => {
      const results = await repo.search('finance');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s1');
    });

    it('is case insensitive', async () => {
      const results = await repo.search('SPRINT');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s2');
    });
  });

  describe('getDistinctTags', () => {
    it('returns unique sorted tags from non-deleted meetings', async () => {
      await db.meetings.bulkAdd([
        {
          id: 't1', title: 'M1', date: new Date(),
          participants: [], tags: ['finance', 'quarterly'],
          stakeholderIds: [], status: 'draft', notes: '',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        },
        {
          id: 't2', title: 'M2', date: new Date(),
          participants: [], tags: ['finance', 'engineering'],
          stakeholderIds: [], status: 'draft', notes: '',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        },
        {
          id: 't3', title: 'M3', date: new Date(),
          participants: [], tags: ['deleted-tag'],
          stakeholderIds: [], status: 'draft', notes: '',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: new Date(),
        },
      ]);

      const tags = await repo.getDistinctTags();
      expect(tags).toEqual(['engineering', 'finance', 'quarterly']);
    });
  });

  describe('getDistinctParticipants', () => {
    it('returns unique sorted participants from non-deleted meetings', async () => {
      await db.meetings.bulkAdd([
        {
          id: 'p1', title: 'M1', date: new Date(),
          participants: ['Alice', 'Bob'], tags: [],
          stakeholderIds: [], status: 'draft', notes: '',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        },
        {
          id: 'p2', title: 'M2', date: new Date(),
          participants: ['Bob', 'Charlie'], tags: [],
          stakeholderIds: [], status: 'draft', notes: '',
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        },
      ]);

      const participants = await repo.getDistinctParticipants();
      expect(participants).toEqual(['Alice', 'Bob', 'Charlie']);
    });
  });

  describe('sync queue', () => {
    it('quickCreate queues a create sync entry', async () => {
      const id = await repo.quickCreate();

      const syncEntries = await db.syncQueue.toArray();
      expect(syncEntries).toHaveLength(1);
      expect(syncEntries[0].entity).toBe('meeting');
      expect(syncEntries[0].entityId).toBe(id);
      expect(syncEntries[0].operation).toBe('create');
      expect(syncEntries[0].syncedAt).toBeNull();
      expect(syncEntries[0].error).toBeNull();
    });

    it('sync entry payload contains the meeting data', async () => {
      const id = await repo.quickCreate();

      const syncEntries = await db.syncQueue.toArray();
      const payload = JSON.parse(syncEntries[0].payload);
      expect(payload.id).toBe(id);
      expect(payload.status).toBe('draft');
    });

    it('update queues an update sync entry', async () => {
      const id = await repo.quickCreate();
      await db.syncQueue.clear();
      await repo.update(id, { title: 'Changed' });

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('update');
    });

    it('softDelete queues a delete sync entry', async () => {
      const id = await repo.quickCreate();
      await db.syncQueue.clear();
      await repo.softDelete(id);

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('delete');
    });

    it('restore queues an update sync entry', async () => {
      const id = await repo.quickCreate();
      await repo.softDelete(id);
      await db.syncQueue.clear();
      await repo.restore(id);

      const entries = await db.syncQueue.toArray();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('update');
    });

    it('each sync entry has a unique id and createdAt timestamp', async () => {
      await repo.quickCreate();
      const id2 = await repo.quickCreate();
      await repo.update(id2, { title: 'test' });

      const entries = await db.syncQueue.toArray();
      expect(entries.length).toBeGreaterThanOrEqual(3);

      const ids = entries.map(e => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      entries.forEach(e => {
        expect(e.createdAt).toBeInstanceOf(Date);
      });
    });
  });
});
