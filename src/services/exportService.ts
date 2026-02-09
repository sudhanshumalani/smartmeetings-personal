import { db } from '../db/database';
import type {
  Meeting,
  Stakeholder,
  StakeholderCategory,
  Transcript,
  MeetingAnalysis,
} from '../db/database';

export interface ExportData {
  exportedAt: string;
  version: string;
  meetings: Meeting[];
  stakeholders: Stakeholder[];
  stakeholderCategories: StakeholderCategory[];
  transcripts: Transcript[];
  meetingAnalyses: MeetingAnalysis[];
}

export interface SingleMeetingExport {
  exportedAt: string;
  version: string;
  meeting: Meeting;
  transcripts: Transcript[];
  meetingAnalyses: MeetingAnalysis[];
}

const EXPORT_VERSION = '1.0';

/**
 * Export all data from all tables (excluding audio blobs per PRD 13.3).
 */
export async function exportAllData(): Promise<ExportData> {
  const [meetings, stakeholders, stakeholderCategories, transcripts, meetingAnalyses] =
    await Promise.all([
      db.meetings.toArray(),
      db.stakeholders.toArray(),
      db.stakeholderCategories.toArray(),
      db.transcripts.toArray(),
      db.meetingAnalyses.toArray(),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    version: EXPORT_VERSION,
    meetings,
    stakeholders,
    stakeholderCategories,
    transcripts,
    meetingAnalyses,
  };
}

/**
 * Export a single meeting with its related transcripts and analyses.
 */
export async function exportMeeting(meetingId: string): Promise<SingleMeetingExport> {
  const meeting = await db.meetings.get(meetingId);
  if (!meeting) throw new Error(`Meeting not found: ${meetingId}`);

  const [transcripts, meetingAnalyses] = await Promise.all([
    db.transcripts.filter((t) => t.meetingId === meetingId).toArray(),
    db.meetingAnalyses.filter((a) => a.meetingId === meetingId).toArray(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: EXPORT_VERSION,
    meeting,
    transcripts,
    meetingAnalyses,
  };
}

/**
 * Validate import data structure. Returns error message or null if valid.
 */
export function validateImportData(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return 'Invalid JSON: expected an object';
  }

  const d = data as Record<string, unknown>;

  if (!d.version || typeof d.version !== 'string') {
    return 'Missing or invalid "version" field';
  }

  if (!d.exportedAt || typeof d.exportedAt !== 'string') {
    return 'Missing or invalid "exportedAt" field';
  }

  const requiredArrays = [
    'meetings',
    'stakeholders',
    'stakeholderCategories',
    'transcripts',
    'meetingAnalyses',
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(d[key])) {
      return `Missing or invalid "${key}" field: expected an array`;
    }
  }

  // Validate meetings have required fields
  for (const m of d.meetings as unknown[]) {
    if (!m || typeof m !== 'object') return 'Invalid meeting entry';
    const meeting = m as Record<string, unknown>;
    if (!meeting.id || typeof meeting.id !== 'string') {
      return 'Meeting missing "id" field';
    }
    if (!meeting.title || typeof meeting.title !== 'string') {
      return 'Meeting missing "title" field';
    }
  }

  return null;
}

/**
 * Import data into Dexie, merging with existing data.
 * Uses last-write-wins by updatedAt for conflicts.
 */
export async function importData(data: ExportData): Promise<{
  imported: number;
  skipped: number;
}> {
  let imported = 0;
  let skipped = 0;

  // Helper: merge a single record using last-write-wins
  async function mergeRecord<T extends { id: string; updatedAt?: Date | string }>(
    table: import('dexie').Table<T>,
    record: T,
  ) {
    const existing = await table.get(record.id);

    // Parse date strings to Dates for comparison
    const recordUpdated = record.updatedAt
      ? new Date(record.updatedAt as string | Date).getTime()
      : 0;

    if (existing) {
      const existingUpdated = (existing as T & { updatedAt?: Date | string }).updatedAt
        ? new Date((existing as T & { updatedAt?: Date | string }).updatedAt as string | Date).getTime()
        : 0;

      if (recordUpdated > existingUpdated) {
        // Incoming is newer — convert date strings back to Dates
        await table.put(deserializeDates(record));
        imported++;
      } else {
        skipped++;
      }
    } else {
      await table.put(deserializeDates(record));
      imported++;
    }
  }

  // Import each table
  for (const m of data.meetings) {
    await mergeRecord(db.meetings, m);
  }
  for (const s of data.stakeholders) {
    await mergeRecord(db.stakeholders, s);
  }
  for (const c of data.stakeholderCategories) {
    await mergeRecord(db.stakeholderCategories, c);
  }
  for (const t of data.transcripts) {
    await mergeRecord(db.transcripts, t);
  }
  for (const a of data.meetingAnalyses) {
    await mergeRecord(db.meetingAnalyses as import('dexie').Table<MeetingAnalysis>, a);
  }

  return { imported, skipped };
}

/**
 * Convert date strings back to Date objects for Dexie storage.
 */
function deserializeDates<T>(record: T): T {
  if (!record || typeof record !== 'object') return record;

  const result = { ...record } as Record<string, unknown>;
  const dateFields = ['date', 'createdAt', 'updatedAt', 'deletedAt'];

  for (const field of dateFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      result[field] = new Date(result[field] as string);
    }
  }

  return result as T;
}

/**
 * Trigger a file download with the given content.
 */
export function downloadJson(data: object, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
