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
  taskFlowSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface StakeholderCategory {
  id: string;
  name: string;
  color: string;
  taskFlowSyncedAt: Date | null;
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
  promptTemplateId?: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export type TaskType = 'task' | 'followup';
export type TaskStatus = 'todo' | 'done';

export interface Task {
  id: string;
  meetingId: string;
  analysisId: string;
  type: TaskType;
  title: string;
  description: string;
  owner: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  status: TaskStatus;
  followUpTarget: string;
  sourceMeetingTitle: string;
  sourceActionItemIndex: number;
  taskFlowSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MeetingTemplate {
  id: string;
  name: string;
  defaultTags: string[];
  defaultStakeholderIds: string[];
  defaultNotes: string;
  promptTemplateId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ErrorLog {
  id: string;
  timestamp: Date;
  message: string;
  stack: string | null;
  component: string | null;
  action: string | null;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  id: string;
  claudeApiKey: string;
  assemblyaiApiKey: string;
  theme: ThemeMode;
  googleClientId: string;
  cloudBackupUrl: string;
  cloudBackupToken: string;
  encryptionKeyMaterial: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncEntity = 'meeting' | 'stakeholder' | 'stakeholderCategory' | 'audioRecording' | 'transcript' | 'meetingAnalysis' | 'task';

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
  promptTemplates!: Table<PromptTemplate>;
  meetingTemplates!: Table<MeetingTemplate>;
  tasks!: Table<Task>;
  errorLogs!: Table<ErrorLog>;

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

    this.version(2).stores({
      meetings: 'id, date, status, *tags, *stakeholderIds, createdAt, updatedAt, deletedAt',
      stakeholders: 'id, name, *categoryIds, createdAt, updatedAt, deletedAt',
      stakeholderCategories: 'id, name, createdAt, deletedAt',
      audioRecordings: 'id, meetingId, order, createdAt, updatedAt, deletedAt',
      audioChunkBuffers: 'id, sessionId, meetingId, chunkIndex',
      transcripts: 'id, meetingId, audioRecordingId, createdAt, updatedAt, deletedAt',
      meetingAnalyses: 'id, meetingId, createdAt, deletedAt',
      appSettings: 'id',
      syncQueue: 'id, entity, entityId, createdAt, syncedAt',
    }).upgrade(tx => {
      return tx.table('appSettings').toCollection().modify(s => {
        s.cloudBackupUrl = s.cloudBackupUrl ?? '';
        s.cloudBackupToken = s.cloudBackupToken ?? '';
      });
    });

    this.version(3).stores({
      meetings: 'id, date, status, *tags, *stakeholderIds, createdAt, updatedAt, deletedAt',
      stakeholders: 'id, name, *categoryIds, createdAt, updatedAt, deletedAt',
      stakeholderCategories: 'id, name, createdAt, deletedAt',
      audioRecordings: 'id, meetingId, order, createdAt, updatedAt, deletedAt',
      audioChunkBuffers: 'id, sessionId, meetingId, chunkIndex',
      transcripts: 'id, meetingId, audioRecordingId, createdAt, updatedAt, deletedAt',
      meetingAnalyses: 'id, meetingId, createdAt, deletedAt',
      appSettings: 'id',
      syncQueue: 'id, entity, entityId, createdAt, syncedAt',
      promptTemplates: 'id, name, isDefault, createdAt, deletedAt',
      meetingTemplates: 'id, name, createdAt, deletedAt',
      errorLogs: 'id, timestamp',
    });

    this.version(4).stores({
      meetings: 'id, date, status, *tags, *stakeholderIds, createdAt, updatedAt, deletedAt',
      stakeholders: 'id, name, *categoryIds, createdAt, updatedAt, deletedAt',
      stakeholderCategories: 'id, name, createdAt, deletedAt',
      audioRecordings: 'id, meetingId, order, createdAt, updatedAt, deletedAt',
      audioChunkBuffers: 'id, sessionId, meetingId, chunkIndex',
      transcripts: 'id, meetingId, audioRecordingId, createdAt, updatedAt, deletedAt',
      meetingAnalyses: 'id, meetingId, createdAt, deletedAt',
      appSettings: 'id',
      syncQueue: 'id, entity, entityId, createdAt, syncedAt',
      promptTemplates: 'id, name, isDefault, createdAt, deletedAt',
      meetingTemplates: 'id, name, createdAt, deletedAt',
      errorLogs: 'id, timestamp',
      tasks: 'id, meetingId, analysisId, type, status, priority, deadline, createdAt, updatedAt, deletedAt',
    });

    this.version(5).stores({
      meetings: 'id, date, status, *tags, *stakeholderIds, createdAt, updatedAt, deletedAt',
      stakeholders: 'id, name, *categoryIds, createdAt, updatedAt, deletedAt',
      stakeholderCategories: 'id, name, createdAt, deletedAt',
      audioRecordings: 'id, meetingId, order, createdAt, updatedAt, deletedAt',
      audioChunkBuffers: 'id, sessionId, meetingId, chunkIndex',
      transcripts: 'id, meetingId, audioRecordingId, createdAt, updatedAt, deletedAt',
      meetingAnalyses: 'id, meetingId, createdAt, deletedAt',
      appSettings: 'id',
      syncQueue: 'id, entity, entityId, createdAt, syncedAt',
      promptTemplates: 'id, name, isDefault, createdAt, deletedAt',
      meetingTemplates: 'id, name, createdAt, deletedAt',
      errorLogs: 'id, timestamp',
      tasks: 'id, meetingId, analysisId, type, status, priority, deadline, createdAt, updatedAt, deletedAt',
    }).upgrade(tx => {
      return Promise.all([
        tx.table('tasks').toCollection().modify(task => {
          task.taskFlowSyncedAt = null;
        }),
        tx.table('stakeholders').toCollection().modify(s => {
          s.taskFlowSyncedAt = null;
        }),
        tx.table('stakeholderCategories').toCollection().modify(c => {
          c.taskFlowSyncedAt = null;
        }),
      ]);
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
      cloudBackupUrl: '',
      cloudBackupToken: '',
      encryptionKeyMaterial: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Seed default prompt templates if none exist
  const promptCount = await db.promptTemplates.count();
  if (promptCount === 0) {
    const now = new Date();
    await db.promptTemplates.bulkAdd(DEFAULT_PROMPT_TEMPLATES.map((t, i) => ({
      ...t,
      id: crypto.randomUUID(),
      isDefault: i === 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })));
  }
}

export const DEFAULT_PROMPT_TEMPLATES: Omit<PromptTemplate, 'id' | 'isDefault' | 'createdAt' | 'updatedAt' | 'deletedAt'>[] = [
  {
    name: 'General Meeting',
    content: `You are an expert meeting notes assistant. Create comprehensive, thematically-organized notes capturing ALL important information.

**Meeting Content:**
"""
\${text}
"""

**Instructions:** Return a JSON object with these fields:

{
  "summary": "3-4 sentences: (1) Meeting purpose, (2) Key outcomes, (3) Most important decision/insight, (4) Critical next step",

  "themes": [
    {
      "topic": "Descriptive topic name",
      "keyPoints": [
        "Detailed point - WHO said it, WHAT was discussed, WHY it matters",
        "Include quotes, numbers, dates, percentages when mentioned",
        "Capture concerns and reasoning behind them"
      ],
      "context": "Why this topic was discussed"
    }
  ],

  "decisions": [
    {"decision": "What was decided", "madeBy": "Who decided", "rationale": "Why", "implications": "What it means"}
  ],

  "actionItems": [
    {"task": "Specific task", "owner": "Name or TBD", "deadline": "Date or TBD", "priority": "high/medium/low", "context": "Why it matters"}
  ],

  "openItems": [
    {"item": "Question or concern", "type": "question/blocker/risk", "owner": "Who addresses it", "urgency": "How soon"}
  ],

  "nextSteps": "2-3 sentences on immediate actions and when team reconnects"
}

**Critical rules:**
- Be CONCISE. Each keyPoint should be 1 sentence. Each theme should have 3-5 keyPoints max.
- Limit to 5-8 themes. Merge related topics.
- Include specific names, numbers, dates when mentioned.
- Skip filler, small talk, and off-topic conversation.

Return ONLY valid JSON, no markdown code blocks.`,
  },
  {
    name: 'Standup / Daily Sync',
    content: `You are a concise meeting notes assistant for daily standups. Focus on status updates, blockers, and plans.

**Meeting Content:**
"""
\${text}
"""

**Instructions:** Return a JSON object:

{
  "summary": "1-2 sentences: team status and any critical blockers",

  "themes": [
    {
      "topic": "Person or Team Area",
      "keyPoints": [
        "Yesterday: what was completed",
        "Today: what is planned",
        "Blockers: any impediments"
      ],
      "context": "Current sprint/project context"
    }
  ],

  "decisions": [
    {"decision": "What was decided", "madeBy": "Who", "rationale": "Why", "implications": "Impact"}
  ],

  "actionItems": [
    {"task": "Specific task", "owner": "Name", "deadline": "Today/Tomorrow/TBD", "priority": "high/medium/low", "context": "Why it matters"}
  ],

  "openItems": [
    {"item": "Blocker or question", "type": "question/blocker/risk", "owner": "Who addresses it", "urgency": "Immediate/Today/This week"}
  ],

  "nextSteps": "1 sentence on what the team will focus on"
}

**Rules:** Keep it short. 2-4 themes max. Focus on blockers and commitments. Skip small talk.

Return ONLY valid JSON, no markdown code blocks.`,
  },
  {
    name: '1:1 Meeting',
    content: `You are a meeting notes assistant for 1:1 meetings. Focus on career growth, feedback, relationship building, and personal action items.

**Meeting Content:**
"""
\${text}
"""

**Instructions:** Return a JSON object:

{
  "summary": "2-3 sentences: main topics discussed, key feedback given/received, and relationship status",

  "themes": [
    {
      "topic": "Topic area (e.g., Career Growth, Project Update, Feedback)",
      "keyPoints": [
        "Key discussion point with context",
        "Feedback given or received",
        "Goals or aspirations mentioned"
      ],
      "context": "Why this was discussed"
    }
  ],

  "decisions": [
    {"decision": "What was agreed on", "madeBy": "Who", "rationale": "Why", "implications": "What changes"}
  ],

  "actionItems": [
    {"task": "Specific follow-up", "owner": "Name", "deadline": "Date or next 1:1", "priority": "high/medium/low", "context": "Why it matters"}
  ],

  "openItems": [
    {"item": "Unresolved topic or concern", "type": "question/blocker/risk", "owner": "Who", "urgency": "By next 1:1 / This week"}
  ],

  "nextSteps": "1-2 sentences on follow-ups and when to reconnect"
}

**Rules:** 3-5 themes. Capture tone and sentiment. Note career goals and personal development items. Preserve confidentiality context.

Return ONLY valid JSON, no markdown code blocks.`,
  },
  {
    name: 'Strategy / Board Meeting',
    content: `You are a meeting notes assistant for strategic and board meetings. Focus on strategic decisions, motions, votes, and long-term implications.

**Meeting Content:**
"""
\${text}
"""

**Instructions:** Return a JSON object:

{
  "summary": "3-4 sentences: meeting purpose, key strategic decisions, most significant outcome, and long-term implications",

  "themes": [
    {
      "topic": "Strategic topic name",
      "keyPoints": [
        "Strategic argument or position presented",
        "Data points, financials, or metrics cited",
        "Dissenting views or concerns raised",
        "Resolution or direction agreed"
      ],
      "context": "Strategic importance and background"
    }
  ],

  "decisions": [
    {"decision": "Strategic decision or motion", "madeBy": "Who proposed/voted", "rationale": "Strategic reasoning", "implications": "Long-term impact"}
  ],

  "actionItems": [
    {"task": "Strategic initiative or follow-up", "owner": "Executive/Team responsible", "deadline": "Timeline", "priority": "high/medium/low", "context": "Strategic alignment"}
  ],

  "openItems": [
    {"item": "Unresolved strategic question or risk", "type": "question/blocker/risk", "owner": "Who owns resolution", "urgency": "Timeline for resolution"}
  ],

  "nextSteps": "2-3 sentences on strategic direction and next review point"
}

**Rules:** 4-8 themes. Capture voting outcomes. Note financial figures precisely. Distinguish between decisions and discussions. Include dissenting opinions.

Return ONLY valid JSON, no markdown code blocks.`,
  },
];
