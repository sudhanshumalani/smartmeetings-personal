import { db } from '../db/database';
import type { Meeting, MeetingTemplate, SyncOperation } from '../db/database';

export class MeetingRepository {
  /** Quick-create: auto-generate title, navigate to editor */
  async quickCreate(): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    const title = `Meeting — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    await db.meetings.add({
      id,
      title,
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

    await this.queueSync('create', id);
    return id;
  }

  /** Quick-create from a meeting template: pre-fill tags, stakeholders, notes */
  async quickCreateFromTemplate(template: MeetingTemplate): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const title = `${template.name} — ${dateStr}`;

    await db.meetings.add({
      id,
      title,
      date: now,
      participants: [],
      tags: [...template.defaultTags],
      stakeholderIds: [...template.defaultStakeholderIds],
      status: 'draft',
      notes: template.defaultNotes,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.queueSync('create', id);
    return id;
  }

  async getById(id: string): Promise<Meeting | undefined> {
    const meeting = await db.meetings.get(id);
    if (meeting?.deletedAt) return undefined;
    return meeting;
  }

  async getAll(): Promise<Meeting[]> {
    return db.meetings
      .filter(m => m.deletedAt === null)
      .reverse()
      .sortBy('date');
  }

  async update(id: string, changes: Partial<Meeting>): Promise<void> {
    await db.meetings.update(id, { ...changes, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async softDelete(id: string): Promise<void> {
    await db.meetings.update(id, { deletedAt: new Date(), updatedAt: new Date() });
    await this.queueSync('delete', id);
  }

  async softDeleteMany(ids: string[]): Promise<void> {
    const now = new Date();
    await db.transaction('rw', [db.meetings, db.syncQueue], async () => {
      for (const id of ids) {
        await db.meetings.update(id, { deletedAt: now, updatedAt: now });
        const record = await db.meetings.get(id);
        await db.syncQueue.add({
          id: crypto.randomUUID(),
          entity: 'meeting',
          entityId: id,
          operation: 'delete',
          payload: JSON.stringify(record),
          createdAt: now,
          syncedAt: null,
          error: null,
        });
      }
    });
  }

  async restore(id: string): Promise<void> {
    await db.meetings.update(id, { deletedAt: null, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async getDeleted(): Promise<Meeting[]> {
    return db.meetings.filter(m => m.deletedAt !== null).toArray();
  }

  async permanentDelete(id: string): Promise<void> {
    await db.transaction('rw', [db.meetings, db.audioRecordings, db.transcripts, db.meetingAnalyses], async () => {
      await db.audioRecordings.where('meetingId').equals(id).delete();
      await db.transcripts.where('meetingId').equals(id).delete();
      await db.meetingAnalyses.where('meetingId').equals(id).delete();
      await db.meetings.delete(id);
    });
  }

  async search(query: string): Promise<Meeting[]> {
    const lowerQuery = query.toLowerCase();
    return db.meetings
      .filter(m =>
        m.deletedAt === null && (
          m.title.toLowerCase().includes(lowerQuery) ||
          m.notes.toLowerCase().includes(lowerQuery) ||
          m.participants.some(p => p.toLowerCase().includes(lowerQuery)) ||
          m.tags.some(t => t.toLowerCase().includes(lowerQuery))
        )
      )
      .toArray();
  }

  async getDistinctTags(): Promise<string[]> {
    const meetings = await db.meetings.filter(m => m.deletedAt === null).toArray();
    return [...new Set(meetings.flatMap(m => m.tags))].sort();
  }

  async getDistinctParticipants(): Promise<string[]> {
    const meetings = await db.meetings.filter(m => m.deletedAt === null).toArray();
    return [...new Set(meetings.flatMap(m => m.participants))].sort();
  }

  private async queueSync(operation: SyncOperation, entityId: string): Promise<void> {
    const record = await db.meetings.get(entityId);
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      entity: 'meeting',
      entityId,
      operation,
      payload: JSON.stringify(record),
      createdAt: new Date(),
      syncedAt: null,
      error: null,
    });
  }
}

export const meetingRepository = new MeetingRepository();
