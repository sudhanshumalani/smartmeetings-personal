import Dexie, { type Table } from 'dexie';

// --- Type Definitions ---

export type MeetingStatus = 'draft' | 'in-progress' | 'completed';

export interface Meeting {
  id: string;
  title: string;
  date: Date;
  participants: string[];
  tags: string[];
  stakeholderIds: string[];
  status: MeetingStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Stakeholder {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  notes?: string;
  categoryIds: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface StakeholderCategory {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AudioRecording {
  id: string;
  meetingId: string;
  blob: Blob;
  mimeType: string;
  duration: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AudioChunkBuffer {
  id: string;
  sessionId: string;
  meetingId: string;
  chunkIndex: number;
  data: Blob;
  mimeType: string;
  createdAt: Date;
}

export interface TranscriptUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SpeakerMap {
  [speakerLabel: string]: string;
}

export interface Transcript {
  id: string;
  meetingId: string;
  audioRecordingId: string;
  assemblyaiTranscriptId: string;
  utterances: TranscriptUtterance[];
  fullText: string;
  speakerMap: SpeakerMap;
  audioDuration: number;
  overallConfidence: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Theme {
  topic: string;
  keyPoints: string[];
  context: string;
}

export interface Decision {
  decision: string;
  madeBy: string;
  rationale: string;
  implications: string;
}

export interface ActionItem {
  task: string;
  owner: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  context: string;
}

export interface OpenItem {
  item: string;
  type: 'question' | 'blocker' | 'risk';
  owner: string;
  urgency: string;
}

export interface MeetingAnalysis {
  id: string;
  meetingId: string;
  summary: string;
  themes: Theme[];
  decisions: Decision[];
  actionItems: ActionItem[];
  openItems: OpenItem[];
  nextSteps: string;
  sourceType: 'api' | 'manual';
  inputText: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  id: string;
  claudeApiKey: string;
  assemblyaiApiKey: string;
  theme: ThemeMode;
  googleClientId: string;
  encryptionKeyMaterial: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncEntity = 'meeting' | 'stakeholder' | 'stakeholderCategory' | 'audioRecording' | 'transcript' | 'meetingAnalysis';

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: string;
  createdAt: Date;
  syncedAt: Date | null;
  error: string | null;
}

// --- Database ---

export class SmartMeetingsDB extends Dexie {
  meetings!: Table<Meeting>;
  stakeholders!: Table<Stakeholder>;
  stakeholderCategories!: Table<StakeholderCategory>;
  audioRecordings!: Table<AudioRecording>;
  audioChunkBuffers!: Table<AudioChunkBuffer>;
  transcripts!: Table<Transcript>;
  meetingAnalyses!: Table<MeetingAnalysis>;
  appSettings!: Table<AppSettings>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('SmartMeetingsDB');
    this.version(1).stores({
      meetings: 'id, date, status, *tags, *stakeholderIds, createdAt, updatedAt, deletedAt',
      stakeholders: 'id, name, *categoryIds, createdAt, updatedAt, deletedAt',
      stakeholderCategories: 'id, name, createdAt, deletedAt',
      audioRecordings: 'id, meetingId, order, createdAt, updatedAt, deletedAt',
      audioChunkBuffers: 'id, sessionId, meetingId, chunkIndex',
      transcripts: 'id, meetingId, audioRecordingId, createdAt, updatedAt, deletedAt',
      meetingAnalyses: 'id, meetingId, createdAt, deletedAt',
      appSettings: 'id',
      syncQueue: 'id, entity, entityId, createdAt, syncedAt',
    });
  }
}

export const db = new SmartMeetingsDB();

/** Initialize default AppSettings record if it doesn't exist (call on app startup) */
export async function initializeDatabase(): Promise<void> {
  const existing = await db.appSettings.get('default');
  if (!existing) {
    await db.appSettings.add({
      id: 'default',
      claudeApiKey: '',
      assemblyaiApiKey: '',
      theme: 'system',
      googleClientId: '',
      encryptionKeyMaterial: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
