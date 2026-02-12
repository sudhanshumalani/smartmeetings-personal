import { db } from '../db/database';
import type { Task, TaskStatus, SyncOperation } from '../db/database';

export type TaskCreateInput = Omit<Task, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export class TaskRepository {
  async getAll(): Promise<Task[]> {
    return db.tasks
      .filter(t => t.deletedAt === null)
      .reverse()
      .sortBy('createdAt');
  }

  async getById(id: string): Promise<Task | undefined> {
    const task = await db.tasks.get(id);
    if (task?.deletedAt) return undefined;
    return task;
  }

  async getByMeetingId(meetingId: string): Promise<Task[]> {
    return db.tasks
      .where('meetingId')
      .equals(meetingId)
      .filter(t => t.deletedAt === null)
      .toArray();
  }

  async getByAnalysisId(analysisId: string): Promise<Task[]> {
    return db.tasks
      .where('analysisId')
      .equals(analysisId)
      .filter(t => t.deletedAt === null)
      .toArray();
  }

  async create(input: TaskCreateInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.tasks.add({
      ...input,
      id,
      status: 'todo',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.queueSync('create', id);
    return id;
  }

  async createMany(inputs: TaskCreateInput[]): Promise<string[]> {
    const now = new Date();
    const tasks: Task[] = inputs.map(input => ({
      ...input,
      id: crypto.randomUUID(),
      status: 'todo' as TaskStatus,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));

    await db.transaction('rw', [db.tasks, db.syncQueue], async () => {
      await db.tasks.bulkAdd(tasks);
      for (const task of tasks) {
        await db.syncQueue.add({
          id: crypto.randomUUID(),
          entity: 'task',
          entityId: task.id,
          operation: 'create',
          payload: JSON.stringify(task),
          createdAt: now,
          syncedAt: null,
          error: null,
        });
      }
    });

    return tasks.map(t => t.id);
  }

  async toggleStatus(id: string): Promise<void> {
    const task = await db.tasks.get(id);
    if (!task) return;
    const newStatus: TaskStatus = task.status === 'todo' ? 'done' : 'todo';
    await db.tasks.update(id, { status: newStatus, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async update(id: string, changes: Partial<Task>): Promise<void> {
    await db.tasks.update(id, { ...changes, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async softDelete(id: string): Promise<void> {
    await db.tasks.update(id, { deletedAt: new Date(), updatedAt: new Date() });
    await this.queueSync('delete', id);
  }

  async restore(id: string): Promise<void> {
    await db.tasks.update(id, { deletedAt: null, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async permanentDelete(id: string): Promise<void> {
    await db.tasks.delete(id);
  }

  async getAddedActionItemIndices(analysisId: string): Promise<Set<number>> {
    const tasks = await db.tasks
      .where('analysisId')
      .equals(analysisId)
      .filter(t => t.deletedAt === null)
      .toArray();
    return new Set(tasks.map(t => t.sourceActionItemIndex));
  }

  async getDeleted(): Promise<Task[]> {
    return db.tasks.filter(t => t.deletedAt !== null).toArray();
  }

  private async queueSync(operation: SyncOperation, entityId: string): Promise<void> {
    const record = await db.tasks.get(entityId);
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      entity: 'task',
      entityId,
      operation,
      payload: JSON.stringify(record),
      createdAt: new Date(),
      syncedAt: null,
      error: null,
    });
  }
}

export const taskRepository = new TaskRepository();
