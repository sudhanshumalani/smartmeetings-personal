import { describe, it, expect, beforeEach } from 'vitest';
import { SmartMeetingsDB, initializeDatabase } from './database';

describe('SmartMeetingsDB', () => {
  let db: SmartMeetingsDB;

  beforeEach(async () => {
    db = new SmartMeetingsDB();
    // Ensure clean state for each test
    await db.delete();
    db = new SmartMeetingsDB();
  });

  it('should open the database successfully', async () => {
    await db.open();
    expect(db.isOpen()).toBe(true);
    db.close();
  });

  it('should have all expected tables', async () => {
    await db.open();
    const tableNames = db.tables.map(t => t.name).sort();
    expect(tableNames).toEqual([
      'appSettings',
      'audioChunkBuffers',
      'audioRecordings',
      'errorLogs',
      'meetingAnalyses',
      'meetingTemplates',
      'meetings',
      'promptTemplates',
      'stakeholderCategories',
      'stakeholders',
      'syncQueue',
      'tasks',
      'transcripts',
    ]);
    db.close();
  });

  it('should initialize default AppSettings', async () => {
    await initializeDatabase();

    const settings = await db.appSettings.get('default');
    expect(settings).toBeDefined();
    expect(settings!.id).toBe('default');
    expect(settings!.claudeApiKey).toBe('');
    expect(settings!.assemblyaiApiKey).toBe('');
    expect(settings!.theme).toBe('system');
    expect(settings!.googleClientId).toBe('');
    expect(settings!.encryptionKeyMaterial).toBe('');
    expect(settings!.createdAt).toBeInstanceOf(Date);
    expect(settings!.updatedAt).toBeInstanceOf(Date);
    db.close();
  });

  it('should not overwrite existing AppSettings on re-init', async () => {
    await initializeDatabase();
    const first = await db.appSettings.get('default');
    const firstCreatedAt = first!.createdAt;

    // Re-initialize — should not overwrite
    await initializeDatabase();
    const second = await db.appSettings.get('default');
    expect(second!.createdAt.getTime()).toBe(firstCreatedAt.getTime());
    db.close();
  });

  it('should create and retrieve a meeting', async () => {
    const now = new Date();
    const meeting = {
      id: 'test-meeting-1',
      title: 'Test Meeting',
      date: now,
      participants: ['Alice', 'Bob'],
      tags: ['standup'],
      stakeholderIds: [],
      status: 'draft' as const,
      notes: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await db.meetings.add(meeting);
    const retrieved = await db.meetings.get('test-meeting-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('Test Meeting');
    expect(retrieved!.participants).toEqual(['Alice', 'Bob']);
    expect(retrieved!.tags).toEqual(['standup']);
    expect(retrieved!.status).toBe('draft');
    expect(retrieved!.deletedAt).toBeNull();
    db.close();
  });

  it('should create and retrieve a stakeholder', async () => {
    const now = new Date();
    const stakeholder = {
      id: 'test-stakeholder-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      organization: 'Acme Corp',
      categoryIds: ['cat-1'],
      taskFlowSyncedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await db.stakeholders.add(stakeholder);
    const retrieved = await db.stakeholders.get('test-stakeholder-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('Jane Doe');
    expect(retrieved!.categoryIds).toEqual(['cat-1']);
    db.close();
  });

  it('should support soft delete on meetings', async () => {
    const now = new Date();
    await db.meetings.add({
      id: 'soft-del-1',
      title: 'To Be Deleted',
      date: now,
      participants: [],
      tags: [],
      stakeholderIds: [],
      status: 'draft',
      notes: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Soft delete
    const deletedAt = new Date();
    await db.meetings.update('soft-del-1', { deletedAt, updatedAt: deletedAt });

    const meeting = await db.meetings.get('soft-del-1');
    expect(meeting).toBeDefined();
    expect(meeting!.deletedAt).toBeInstanceOf(Date);

    // Filter out soft-deleted
    const active = await db.meetings.filter(m => m.deletedAt === null).toArray();
    expect(active).toHaveLength(0);
    db.close();
  });

  it('should add items to the sync queue', async () => {
    const now = new Date();
    await db.syncQueue.add({
      id: 'sync-1',
      entity: 'meeting',
      entityId: 'meeting-1',
      operation: 'create',
      payload: '{}',
      createdAt: now,
      syncedAt: null,
      error: null,
    });

    const pending = await db.syncQueue.filter(i => i.syncedAt === null).toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].entity).toBe('meeting');
    expect(pending[0].operation).toBe('create');
    db.close();
  });
});
