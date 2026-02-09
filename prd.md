# SmartMeetings — Product Requirements Document

> **Progressive Web App for Intelligent Meeting Notes Management**
>
> Version: 2.1 | Last updated: 2026-02-06

---

## Table of Contents

1. [Overview](#1-overview)
2. [Lessons Learned (Non-Negotiables)](#2-lessons-learned-non-negotiables)
3. [Tech Stack](#3-tech-stack)
4. [Data Model](#4-data-model)
5. [Application Architecture](#5-application-architecture)
6. [Routes & Navigation](#6-routes--navigation)
7. [Key Services](#7-key-services)
8. [AI Analysis — Prompt & Workflows](#8-ai-analysis--prompt--workflows)
9. [Audio Recording & Transcription (AssemblyAI)](#9-audio-recording--transcription-assemblyai)
10. [Stakeholder Management](#10-stakeholder-management)
11. [Cloud Backup (Cloudflare D1 + Workers)](#11-cloud-backup-cloudflare-d1--workers)
12. [PWA Configuration](#12-pwa-configuration)
13. [Export](#13-export)
14. [Phased Roadmap](#14-phased-roadmap)
15. [Dependencies](#15-dependencies)
16. [Testing & Error Handling](#16-testing--error-handling)

---

## 1. Overview

SmartMeetings is an offline-first Progressive Web App that lets users record, transcribe, and intelligently analyze meetings. Users can capture rich-text notes, record audio, generate AI-powered summaries with thematic analysis, manage stakeholder relationships, and search across their entire meeting history — all from the browser.

### Goals

- **Offline-first**: All CRUD operations, notes editing, and search work without internet. API-dependent features degrade gracefully with clear indicators.
- **Never lose data**: Soft deletes everywhere, periodic audio chunk saving, crash recovery, cloud backup via Cloudflare D1.
- **AI-powered analysis**: Claude extracts summaries, themes, decisions, action items, open items, and next steps — from audio transcripts or manually pasted notes.
- **Stakeholder management**: Track contacts by category (Investors, Schools, Ecosystem Partners, etc.) with color-coded badges and meeting linkage.
- **Mobile = capture, Desktop = process**: Mobile is simplified for recording and quick notes. Desktop handles full editing, transcription, and analysis.
- **Installable PWA**: Targeting Lighthouse PWA score of 90+.

---

## 2. Lessons Learned (Non-Negotiables)

These rules override any implementation instinct. Violating them is how the last version failed.

| # | Rule | Implication |
|---|---|---|
| 1 | **No complicated sync** | Manual sync button only. One-way local→cloud. Last-write-wins. No conflict resolution. |
| 2 | **ONE storage layer** | Dexie/IndexedDB for everything. No localStorage, no localforage. Zero exceptions. |
| 3 | **Never auto-delete data** | Soft delete everything (`deletedAt` field). Hard delete requires explicit user action in Trash. |
| 4 | **Simple state management** | React Context + Dexie. No Zustand, no Redux. Keep state close to where it's used. |
| 5 | **No premature optimization** | No tiered storage, no transcript chunking, no Web Workers for search. Add when you hit real problems. |
| 6 | **No feature creep** | Build core features, polish them, ship. No analytics dashboard before CRUD works perfectly. |
| 7 | **iOS PWA is limited** | Keep mobile simple: record + quick notes + view. Process everything on desktop. Always check iOS compatibility. |

---

## 3. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | React 18+ / TypeScript | UI components, type safety |
| **Build Tool** | Vite | Fast dev server, optimized builds |
| **Styling** | Tailwind CSS | Utility-first styling, small production bundle |
| **Data Persistence** | Dexie.js (IndexedDB) | Offline-first structured storage — the ONE storage layer |
| **Rich Text Editor** | TipTap (ProseMirror-based) | Meeting notes (headings, lists, bold, italic, code blocks) |
| **AI Analysis** | Anthropic Claude API (`@anthropic-ai/sdk`) | Meeting content analysis, `dangerouslyAllowBrowser: true` |
| **Audio Transcription** | AssemblyAI REST API (batch) | Speaker diarization via pre-recorded audio upload |
| **State Management** | React Context (ephemeral UI) + Dexie (persisted data) | No Zustand, no Redux. Context for theme/toasts/modals. |
| **PWA** | vite-plugin-pwa + Workbox | Service worker, precaching, offline support |
| **Routing** | React Router v6 | Client-side navigation |
| **Encryption** | Web Crypto API (AES-GCM) | API key obfuscation at rest |
| **Cloud Backup** | Cloudflare D1 + Workers | One-way sync, outbox pattern, manual trigger |
| **Icons** | Lucide React | Consistent icon set |
| **Testing** | Vitest + Testing Library + fake-indexeddb | Unit/integration testing |

---

## 4. Data Model

All entities are stored in IndexedDB via Dexie.js. Every entity has a `deletedAt` field for soft delete.

### 4.1 Meeting

```typescript
type MeetingStatus = 'draft' | 'in-progress' | 'completed';

interface Meeting {
  id: string;                  // crypto.randomUUID()
  title: string;
  date: Date;
  participants: string[];      // Free-text attendee names (not stakeholders)
  tags: string[];              // Free-text, with autocomplete from previous values
  stakeholderIds: string[];    // FK → Stakeholder.id (linked stakeholders)
  status: MeetingStatus;
  notes: string;               // TipTap JSON format
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;      // Soft delete
}
```

### 4.2 Stakeholder

```typescript
interface Stakeholder {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  notes?: string;
  categoryIds: string[];       // Multiple categories per stakeholder
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

### 4.3 StakeholderCategory

```typescript
interface StakeholderCategory {
  id: string;
  name: string;                // e.g. "Investors", "Schools", "Ecosystem Partners"
  color: string;               // Hex from preset palette (e.g. '#ef4444')
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

**Preset color palette** (~12 colors):
```typescript
const CATEGORY_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#6b7280', // gray
];
```

### 4.4 AudioRecording

Multiple recordings per meeting. Each recording is saved separately for crash resilience.

```typescript
interface AudioRecording {
  id: string;
  meetingId: string;           // FK → Meeting.id
  blob: Blob;                  // Recorded audio binary
  mimeType: string;            // 'audio/webm;codecs=opus' or 'audio/mp4'
  duration: number;            // Seconds
  order: number;               // Sequence within meeting (1, 2, 3...)
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

### 4.5 AudioChunkBuffer

Periodic chunk saving during recording for crash recovery.

```typescript
interface AudioChunkBuffer {
  id: string;
  sessionId: string;           // Recording session identifier
  meetingId: string;           // FK → Meeting.id
  chunkIndex: number;          // Order of chunk within session
  data: Blob;                  // Audio chunk data
  mimeType: string;
  createdAt: Date;
}
```

### 4.6 Transcript

```typescript
interface TranscriptUtterance {
  speaker: string;             // "A", "B", "C" (raw from AssemblyAI)
  text: string;
  start: number;               // Milliseconds
  end: number;                 // Milliseconds
  confidence: number;          // 0–1
}

interface SpeakerMap {
  [speakerLabel: string]: string;  // e.g. { "A": "Sudhanshu", "B": "John" }
}

interface Transcript {
  id: string;
  meetingId: string;           // FK → Meeting.id
  audioRecordingId: string;    // FK → AudioRecording.id
  assemblyaiTranscriptId: string; // AssemblyAI's transcript ID for re-fetch
  utterances: TranscriptUtterance[];
  fullText: string;            // Concatenated transcript text
  speakerMap: SpeakerMap;      // User-assigned speaker names
  audioDuration: number;       // Seconds
  overallConfidence: number;   // 0–1
  createdAt: Date;
  updatedAt: Date;             // Required for sync last-write-wins
  deletedAt: Date | null;
}
```

### 4.7 MeetingAnalysis

Matches the exact output of the AI prompt. Old analyses are soft-deleted when re-running.

```typescript
interface Theme {
  topic: string;
  keyPoints: string[];
  context: string;
}

interface Decision {
  decision: string;
  madeBy: string;
  rationale: string;
  implications: string;
}

interface ActionItem {
  task: string;
  owner: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  context: string;
}

interface OpenItem {
  item: string;
  type: 'question' | 'blocker' | 'risk';
  owner: string;
  urgency: string;
}

interface MeetingAnalysis {
  id: string;
  meetingId: string;           // FK → Meeting.id
  summary: string;             // 3–4 sentences
  themes: Theme[];
  decisions: Decision[];
  actionItems: ActionItem[];
  openItems: OpenItem[];
  nextSteps: string;           // 2–3 sentences
  sourceType: 'api' | 'manual'; // API call or copy-paste workflow
  inputText: string;           // The text that was analyzed (for reference)
  createdAt: Date;
  deletedAt: Date | null;      // Soft-replaced when re-running analysis
}
```

### 4.8 AppSettings

```typescript
type ThemeMode = 'light' | 'dark' | 'system';

interface AppSettings {
  id: string;                            // Always 'default' (singleton)
  claudeApiKey: string;                  // Encrypted via Web Crypto API
  assemblyaiApiKey: string;              // Encrypted
  theme: ThemeMode;
  cloudBackupUrl: string;                // Cloudflare Worker URL
  cloudBackupToken: string;              // Encrypted bearer token
  encryptionKeyMaterial: string;         // Base64 AES-GCM key material (auto-generated)
  createdAt: Date;
  updatedAt: Date;
}
```

### 4.9 SyncQueue (Outbox Pattern)

```typescript
type SyncOperation = 'create' | 'update' | 'delete';
type SyncEntity = 'meeting' | 'stakeholder' | 'stakeholderCategory' | 'audioRecording' | 'transcript' | 'meetingAnalysis';

interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  entityId: string;            // ID of the changed record
  operation: SyncOperation;
  payload: string;             // JSON-serialized record snapshot
  createdAt: Date;
  syncedAt: Date | null;       // null = pending, Date = synced
  error: string | null;        // Last sync error message
}
```

### 4.10 Dexie Database Schema

```typescript
import Dexie, { Table } from 'dexie';

class SmartMeetingsDB extends Dexie {
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
      cloudBackupUrl: '',
      cloudBackupToken: '',
      encryptionKeyMaterial: '',    // Generated on first encrypt() call
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
```

Call `initializeDatabase()` in `App.tsx` inside a `useEffect` on mount, before any service reads from `appSettings`.

---

## 5. Application Architecture

### 5.1 Folder Structure

```
src/
├── app/
│   ├── App.tsx                    # Root component, router, providers
│   ├── Layout.tsx                 # Top nav + <Outlet />
│   └── routes.tsx                 # Route definitions
├── features/
│   ├── meetings/
│   │   ├── components/            # MeetingList, MeetingCard, MeetingForm, MeetingMetadata
│   │   ├── pages/                 # MeetingListPage, MeetingDetailPage
│   │   └── hooks/                 # useMeetings, useMeeting
│   ├── editor/
│   │   ├── components/            # RichTextEditor, EditorToolbar
│   │   └── hooks/                 # useAutoSave
│   ├── audio/
│   │   ├── components/            # AudioRecorder, AudioPlayer, TranscriptViewer,
│   │   │                          # SpeakerRenamePanel, RecordingRecoveryDialog
│   │   └── hooks/                 # useAudioRecorder, useWakeLock
│   ├── analysis/
│   │   ├── components/            # AnalysisPanel, ThemeCard, DecisionCard,
│   │   │                          # ActionItemList, OpenItemList, CopyPasteModal
│   │   └── hooks/                 # useAnalysis
│   ├── stakeholders/
│   │   ├── components/            # StakeholderList, StakeholderCard, StakeholderForm,
│   │   │                          # CategoryManager, CategoryBadge, StakeholderPicker
│   │   ├── pages/                 # StakeholderListPage, StakeholderDetailPage
│   │   └── hooks/                 # useStakeholders, useCategories
│   ├── search/
│   │   ├── components/            # SearchBar, FilterPanel, SearchResults
│   │   └── hooks/                 # useSearch
│   └── settings/
│       ├── components/            # ApiKeyInput, ThemeToggle, ExportPanel, CloudBackupPanel
│       └── pages/                 # SettingsPage
├── shared/
│   ├── components/                # Header, OfflineIndicator, Toast, ConfirmDialog,
│   │                              # EmptyState, TrashView
│   ├── hooks/                     # useOnlineStatus, useDebounce, useToast
│   └── utils/                     # uuid, formatDate, etc.
├── services/
│   ├── claudeService.ts           # Claude API integration
│   ├── assemblyaiService.ts       # AssemblyAI REST API (upload → transcribe → poll)
│   ├── audioRecorderService.ts    # MediaRecorder API wrapper with chunk persistence
│   ├── meetingRepository.ts       # Dexie CRUD with soft deletes
│   ├── stakeholderRepository.ts   # Stakeholder + category CRUD
│   ├── syncService.ts             # Outbox queue + Cloudflare Worker push
│   ├── encryption.ts              # Web Crypto API key encryption
│   └── wakeLockService.ts         # Screen Wake Lock API + fallback
├── contexts/
│   ├── ThemeContext.tsx            # Light/dark/system theme
│   ├── ToastContext.tsx            # Toast notification state
│   └── OnlineContext.tsx           # Online/offline status
├── db/
│   └── database.ts                # Dexie instance + schema
├── main.tsx
└── index.css                      # Tailwind directives
```

### 5.2 Component Tree

```
<App>
  <ThemeProvider>
    <ToastProvider>
      <OnlineProvider>
        <Layout>
          <Header>
            <Logo />
            <NavLinks />        ← Dashboard | Stakeholders | Settings
            <SearchBar />
            <ThemeToggle />
            <OnlineIndicator />
            <SyncButton />
          </Header>
          <main>
            <Outlet />          ← React Router renders pages here
          </main>
        </Layout>
        <Toast />
      </OnlineProvider>
    </ToastProvider>
  </ThemeProvider>
</App>
```

No sidebar. All navigation lives in the top nav bar.

### 5.3 Meeting Detail Page Layout (Tabs)

Three tabs — only one visible at a time. Clean and focused.

```
┌──────────────────────────────────────────────────────────┐
│ [← Back]  Meeting Title (editable)    [Status: Draft ▾]  │
│ Date: Feb 6, 2026  │  Stakeholders: [chips]  │  Tags: [chips]  │
├──────────────────────────────────────────────────────────┤
│  [ Notes ]    [ Audio & Transcript ]    [ Analysis ]     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  (Active tab content renders here)                       │
│                                                          │
│  Notes tab:                                              │
│    TipTap rich text editor                               │
│    Auto-save indicator: "Saving..." / "Saved"            │
│                                                          │
│  Audio tab:                                              │
│    Recording controls: ● Record  ⏸ Pause  ⏹ Stop        │
│    Recording list (multiple per meeting)                  │
│    Audio player for each recording                       │
│    Transcript viewer with speaker labels                  │
│    Speaker rename panel                                   │
│    Online/offline indicator for upload                    │
│    Upload progress bar                                    │
│    Transcription status steps                             │
│                                                          │
│  Analysis tab:                                           │
│    [Analyze] button (or [Re-analyze] if exists)          │
│    Summary → Themes → Decisions → Action Items →          │
│    Open Items → Next Steps                                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

On mobile, same tabs but simplified: Notes tab is a basic text area, Audio tab has record/stop controls only, Analysis tab is view-only.

### 5.4 State Management Strategy

| State type | Store | Example |
|---|---|---|
| **Persisted data** | Dexie.js (IndexedDB) | Meetings, stakeholders, recordings, transcripts, analyses, settings, sync queue |
| **UI theme** | React Context (ThemeContext) | Light/dark/system — initialized from Dexie AppSettings |
| **Toast notifications** | React Context (ToastContext) | Active toasts queue |
| **Online status** | React Context (OnlineContext) | `navigator.onLine` + event listeners |
| **Component-local** | React useState/useReducer | Form inputs, editor content buffer, modal open/closed |

**No localStorage. No Zustand. No Redux.** Dexie is the single source of truth.

### 5.5 Dashboard (MeetingListPage)

Card grid with collapsible date sections and filtering.

```
┌──────────────────────────────────────────────────────────┐
│ [+ New Meeting]    [Search...]    [Filter ▾]  [Trash 🗑] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ▼ This Week                                              │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                     │
│ │ Meeting │ │ Meeting │ │ Meeting │                      │
│ │ Card    │ │ Card    │ │ Card    │                      │
│ └─────────┘ └─────────┘ └─────────┘                     │
│                                                          │
│ ▼ Last Week                                              │
│ ┌─────────┐ ┌─────────┐                                 │
│ │ Meeting │ │ Meeting │                                  │
│ │ Card    │ │ Card    │                                  │
│ └─────────┘ └─────────┘                                 │
│                                                          │
│ ► January 2026 (collapsed)                               │
│                                                          │
└──────────────────────────────────────────────────────────┘

Each card shows:
- Title
- Date
- Status badge (Draft/In Progress/Completed)
- Stakeholder category badges (color-coded)
- Tag chips
- Participant count
```

**Filters**: status, stakeholder, stakeholder category, tags, date range.
**Sort**: date (default), title, last modified.
**Search**: full-text across title, notes, participants, tags (300ms debounce).

**Empty state** (first run): Friendly "No meetings yet" message with prominent "Create your first meeting" button and a hint to set up API keys in Settings.

---

## 6. Routes & Navigation

| Route | Page Component | Description |
|---|---|---|
| `/` | `MeetingListPage` | Dashboard with card grid, search, filters |
| `/meetings/:id` | `MeetingDetailPage` | Tabbed meeting workspace (notes, audio, analysis) |
| `/stakeholders` | `StakeholderListPage` | Stakeholder list with search and category filter |
| `/stakeholders/:id` | `StakeholderDetailPage` | Stakeholder detail + linked meetings |
| `/settings` | `SettingsPage` | API keys, theme, cloud backup, export/import |
| `/trash` | `TrashPage` | Soft-deleted items, restore or permanent delete |

**Meeting creation**: No `/meetings/new` route. Clicking "New Meeting" auto-creates a draft meeting with a default title ("Meeting — Feb 6, 2026") and navigates to `/meetings/:id`. User edits metadata inline on the detail page.

All routes are wrapped by `<Layout>` providing the top nav bar, offline indicator, and toast container.

### 6.1 Trash Page Specification

The Trash page (`/trash`) shows all soft-deleted entities with restore and permanent delete actions.

**Layout**: Tabbed by entity type:

| Tab | Content |
|---|---|
| **Meetings** | Soft-deleted meetings with title, date, deleted date. Each row has [Restore] and [Delete Forever] buttons. |
| **Stakeholders** | Soft-deleted stakeholders with name, categories. Same restore/delete buttons. |

**Behaviors**:
- Items sorted by `deletedAt` (most recently deleted first)
- **Restore**: Sets `deletedAt = null`, `updatedAt = now`. Item reappears in normal views. Queues sync.
- **Delete Forever**: Shows confirmation dialog ("This cannot be undone. Continue?"). On confirm, performs hard cascading delete:
  - **Meeting**: Permanently removes meeting + all linked audioRecordings, transcripts, and meetingAnalyses
  - **Stakeholder**: Permanently removes stakeholder. Removes its ID from `stakeholderIds[]` on any meetings that reference it.
  - **StakeholderCategory**: Permanently removes category. Removes its ID from `categoryIds[]` on any stakeholders that reference it.
- **"Empty Trash"** button: Confirmation dialog, then permanently deletes ALL items in the current tab
- Trash is accessible via a trash icon link in the dashboard header and the nav bar

---

## 7. Key Services

### 7.1 ClaudeService

```typescript
// services/claudeService.ts
import Anthropic from '@anthropic-ai/sdk';

const ANALYSIS_PROMPT = `...`; // Full prompt in Section 8

interface AnalysisResult {
  summary: string;
  themes: { topic: string; keyPoints: string[]; context: string }[];
  decisions: { decision: string; madeBy: string; rationale: string; implications: string }[];
  actionItems: { task: string; owner: string; deadline: string; priority: string; context: string }[];
  openItems: { item: string; type: string; owner: string; urgency: string }[];
  nextSteps: string;
}

export class ClaudeService {
  private client: Anthropic | null = null;

  initialize(apiKey: string): void {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async analyze(text: string): Promise<AnalysisResult> {
    if (!this.client) {
      throw new Error('Claude API key not configured');
    }

    const prompt = ANALYSIS_PROMPT.replace('${text}', text);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format');
    }

    return JSON.parse(content.text) as AnalysisResult;
  }

  buildPromptForCopyPaste(text: string): string {
    return ANALYSIS_PROMPT.replace('${text}', text);
  }

  parseManualResult(jsonString: string): AnalysisResult {
    const parsed = JSON.parse(jsonString);
    if (!parsed.summary || !parsed.themes || !parsed.actionItems) {
      throw new Error('Invalid analysis format: missing required fields');
    }
    return parsed as AnalysisResult;
  }
}

export const claudeService = new ClaudeService();
```

### 7.2 AssemblyAI Service

Batch upload → transcription with speaker diarization → poll for results.

> **Security tradeoff (accepted for MVP):** The AssemblyAI API key is sent directly from the browser in request headers, visible in DevTools/network tab. This is the same tradeoff as the Claude API key (`dangerouslyAllowBrowser`). For a personal/single-user app this is acceptable. In Phase 2, consider proxying AssemblyAI calls through the existing Cloudflare Worker (which already handles token provisioning) to keep the key server-side.

```typescript
// services/assemblyaiService.ts

interface AssemblyAIUtterance {
  speaker: string;             // "A", "B", "C"
  text: string;
  start: number;               // Milliseconds
  end: number;
  confidence: number;
  words: { text: string; start: number; end: number; confidence: number; speaker: string }[];
}

interface TranscriptionResult {
  transcriptId: string;        // AssemblyAI's ID for re-fetching
  text: string;                // Full transcript text
  utterances: AssemblyAIUtterance[];
  audioDuration: number;       // Seconds
  confidence: number;
  speakersDetected: number;
}

type TranscriptionStatus = 'uploading' | 'processing' | 'completed' | 'error';

interface ProgressCallback {
  onStatusChange: (status: TranscriptionStatus, detail?: string) => void;
  onUploadProgress: (percent: number) => void;
}

export class AssemblyAIService {
  private apiKey: string = '';

  initialize(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async transcribe(audioBlob: Blob, callbacks: ProgressCallback): Promise<TranscriptionResult> {
    // Step 1: Upload audio with progress tracking
    callbacks.onStatusChange('uploading', 'Uploading audio...');
    const uploadUrl = await this.uploadAudio(audioBlob, callbacks.onUploadProgress);

    // Step 2: Request transcription with speaker diarization
    callbacks.onStatusChange('processing', 'Transcribing with speaker detection...');
    const transcriptId = await this.requestTranscription(uploadUrl);

    // Step 3: Poll for result (every 1 second, up to 3 minutes)
    const result = await this.pollForResult(transcriptId, callbacks);

    return result;
  }

  private async uploadAudio(blob: Blob, onProgress: (percent: number) => void): Promise<string> {
    // Use XMLHttpRequest for upload progress events
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.assemblyai.com/v2/upload');
      xhr.setRequestHeader('authorization', this.apiKey);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const { upload_url } = JSON.parse(xhr.responseText);
          resolve(upload_url);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(blob);
    });
  }

  private async requestTranscription(audioUrl: string): Promise<string> {
    const response = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,        // Enables speaker diarization
        speakers_expected: null,     // Auto-detect number of speakers
        language_code: 'en',
      }),
    });

    if (!response.ok) throw new Error(`Transcription request failed: ${response.status}`);
    const { id } = await response.json();
    return id;
  }

  private async pollForResult(transcriptId: string, callbacks: ProgressCallback): Promise<TranscriptionResult> {
    const maxAttempts = 180; // 3 minutes at 1 second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { 'authorization': this.apiKey } }
      );

      const data = await response.json();

      if (data.status === 'completed') {
        callbacks.onStatusChange('completed', 'Transcription complete!');

        const speakersDetected = new Set(
          (data.utterances || []).map((u: AssemblyAIUtterance) => u.speaker)
        ).size;

        return {
          transcriptId,
          text: data.text,
          utterances: data.utterances || [],
          audioDuration: data.audio_duration,
          confidence: data.confidence,
          speakersDetected,
        };
      }

      if (data.status === 'error') {
        callbacks.onStatusChange('error', data.error);
        throw new Error(`Transcription error: ${data.error}`);
      }

      // Still processing
      callbacks.onStatusChange('processing', `Transcribing... (${attempts}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error('Transcription timed out after 3 minutes');
  }
}

export const assemblyaiService = new AssemblyAIService();
```

### 7.3 AudioRecorderService

MediaRecorder wrapper with periodic chunk persistence to IndexedDB for crash recovery.

```typescript
// services/audioRecorderService.ts
import { db } from '../db/database';

export class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private sessionId: string = '';
  private chunkIndex: number = 0;
  private meetingId: string = '';

  private getSupportedMimeType(): string {
    // iOS Safari requires audio/mp4
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    return 'audio/webm';
  }

  async startRecording(meetingId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    const mimeType = this.getSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 128000,
    });

    this.chunks = [];
    this.chunkIndex = 0;
    this.meetingId = meetingId;
    this.sessionId = crypto.randomUUID();

    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);

        // Persist chunk to IndexedDB for crash recovery
        await db.audioChunkBuffers.add({
          id: crypto.randomUUID(),
          sessionId: this.sessionId,
          meetingId: this.meetingId,
          chunkIndex: this.chunkIndex++,
          data: event.data,
          mimeType,
          createdAt: new Date(),
        });
      }
    };

    this.mediaRecorder.start(1000); // Emit chunk every 1 second
  }

  async stopRecording(): Promise<{ blob: Blob; mimeType: string; sessionId: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder!.mimeType;
        const blob = new Blob(this.chunks, { type: mimeType });

        // Validate: minimum 2 seconds, 1KB
        if (blob.size < 1024) {
          reject(new Error('Recording too short or empty'));
          return;
        }

        // Release microphone
        this.mediaRecorder!.stream.getTracks().forEach(track => track.stop());

        // Clear chunk buffer for this session (recording saved successfully)
        await db.audioChunkBuffers.where('sessionId').equals(this.sessionId).delete();

        resolve({ blob, mimeType, sessionId: this.sessionId });
      };

      this.mediaRecorder.stop();
    });
  }

  pauseRecording(): void {
    this.mediaRecorder?.pause();
  }

  resumeRecording(): void {
    this.mediaRecorder?.resume();
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  isPaused(): boolean {
    return this.mediaRecorder?.state === 'paused';
  }

  /** Recover audio from chunk buffers after a crash */
  static async recoverSession(sessionId: string): Promise<Blob | null> {
    const chunks = await db.audioChunkBuffers
      .where('sessionId').equals(sessionId)
      .sortBy('chunkIndex');

    if (chunks.length === 0) return null;

    const blob = new Blob(
      chunks.map(c => c.data),
      { type: chunks[0].mimeType }
    );

    return blob;
  }

  /** Check for any unfinished recording sessions for a meeting */
  static async getOrphanedSessions(meetingId: string): Promise<string[]> {
    const chunks = await db.audioChunkBuffers
      .where('meetingId').equals(meetingId)
      .toArray();

    const sessionIds = [...new Set(chunks.map(c => c.sessionId))];
    return sessionIds;
  }
}

export const audioRecorderService = new AudioRecorderService();
```

### 7.4 WakeLockService

Prevents screen from sleeping during recording, upload, and transcription.

```typescript
// services/wakeLockService.ts

export class WakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private silentAudio: HTMLAudioElement | null = null;

  async acquire(): Promise<void> {
    // Try Wake Lock API first
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
        return;
      } catch (err) {
        // Wake Lock failed (e.g., low battery, tab not visible)
        console.warn('Wake Lock failed, using audio fallback:', err);
      }
    }

    // Fallback: play silent audio loop to keep screen awake
    this.silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
    this.silentAudio.loop = true;
    this.silentAudio.volume = 0.01; // Nearly silent
    await this.silentAudio.play().catch(() => {});
  }

  async release(): Promise<void> {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
    if (this.silentAudio) {
      this.silentAudio.pause();
      this.silentAudio = null;
    }
  }

  isActive(): boolean {
    return this.wakeLock !== null || this.silentAudio !== null;
  }
}

export const wakeLockService = new WakeLockService();
```

### 7.5 MeetingRepository

Dexie CRUD with soft deletes. No cascading hard deletes.

```typescript
// services/meetingRepository.ts
import { db } from '../db/database';
import type { Meeting } from '../db/database';

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

    // Queue for sync
    await this.queueSync('create', id);

    return id;
  }

  async getById(id: string): Promise<Meeting | undefined> {
    const meeting = await db.meetings.get(id);
    if (meeting?.deletedAt) return undefined; // Treat soft-deleted as not found
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

  async restore(id: string): Promise<void> {
    await db.meetings.update(id, { deletedAt: null, updatedAt: new Date() });
    await this.queueSync('update', id);
  }

  async getDeleted(): Promise<Meeting[]> {
    return db.meetings.filter(m => m.deletedAt !== null).toArray();
  }

  async permanentDelete(id: string): Promise<void> {
    // Only from Trash, explicit user action
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

  /** Get distinct values for autocomplete */
  async getDistinctTags(): Promise<string[]> {
    const meetings = await db.meetings.filter(m => m.deletedAt === null).toArray();
    return [...new Set(meetings.flatMap(m => m.tags))].sort();
  }

  async getDistinctParticipants(): Promise<string[]> {
    const meetings = await db.meetings.filter(m => m.deletedAt === null).toArray();
    return [...new Set(meetings.flatMap(m => m.participants))].sort();
  }

  private async queueSync(operation: 'create' | 'update' | 'delete', entityId: string): Promise<void> {
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
```

### 7.6 SyncService (Outbox → Cloudflare Worker)

```typescript
// services/syncService.ts
import { db } from '../db/database';
import { decrypt } from './encryption';

export class SyncService {
  /** Manually triggered sync — flush outbox to cloud */
  async pushChanges(): Promise<{ synced: number; failed: number }> {
    const settings = await db.appSettings.get('default');
    if (!settings?.cloudBackupUrl || !settings?.cloudBackupToken) {
      throw new Error('Cloud backup not configured');
    }

    const backupUrl = settings.cloudBackupUrl;
    const token = await decrypt(settings.cloudBackupToken);

    const pending = await db.syncQueue
      .filter(item => item.syncedAt === null)
      .sortBy('createdAt');

    let synced = 0;
    let failed = 0;

    // Process in batches of 50
    for (let i = 0; i < pending.length; i += 50) {
      const batch = pending.slice(i, i + 50);

      try {
        const response = await fetch(`${backupUrl}/push`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            changes: batch.map(item => ({
              entity: item.entity,
              entityId: item.entityId,
              operation: item.operation,
              payload: item.payload,
              timestamp: item.createdAt.toISOString(),
            })),
          }),
        });

        if (response.ok) {
          // Mark batch as synced
          await Promise.all(
            batch.map(item =>
              db.syncQueue.update(item.id, { syncedAt: new Date() })
            )
          );
          synced += batch.length;
        } else {
          const error = await response.text();
          await Promise.all(
            batch.map(item =>
              db.syncQueue.update(item.id, { error })
            )
          );
          failed += batch.length;
        }
      } catch (err) {
        failed += batch.length;
      }
    }

    return { synced, failed };
  }

  /** Pull latest data from cloud (for recovery / new device) */
  async pullData(since?: Date): Promise<void> {
    const settings = await db.appSettings.get('default');
    if (!settings?.cloudBackupUrl || !settings?.cloudBackupToken) {
      throw new Error('Cloud backup not configured');
    }

    const backupUrl = settings.cloudBackupUrl;
    const token = await decrypt(settings.cloudBackupToken);
    const sinceParam = since ? `?since=${since.toISOString()}` : '';

    const response = await fetch(`${backupUrl}/pull${sinceParam}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(`Pull failed: ${response.status}`);

    const data = await response.json();
    // Overwrite local records with cloud data (last-write-wins)
    // ... apply each record to respective Dexie tables
  }

  /** Check sync status */
  async getStatus(): Promise<{ pending: number; lastSynced: Date | null; errors: number }> {
    const pending = await db.syncQueue.filter(i => i.syncedAt === null && i.error === null).count();
    const errors = await db.syncQueue.filter(i => i.error !== null && i.syncedAt === null).count();

    const lastSynced = await db.syncQueue
      .filter(i => i.syncedAt !== null)
      .reverse()
      .sortBy('syncedAt');

    return {
      pending,
      errors,
      lastSynced: lastSynced[0]?.syncedAt || null,
    };
  }

  /** Get count of pending changes */
  async getPendingCount(): Promise<number> {
    return db.syncQueue.filter(i => i.syncedAt === null).count();
  }
}

export const syncService = new SyncService();
```

### 7.7 Encryption Service

Encrypts API keys at rest. Encryption key stored in Dexie (not localStorage).

```typescript
// services/encryption.ts
import { db } from '../db/database';

const ALGORITHM = 'AES-GCM';

async function getOrCreateKey(): Promise<CryptoKey> {
  // Store encryption key material in appSettings
  const settings = await db.appSettings.get('default');
  const stored = settings?.encryptionKeyMaterial;

  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, ALGORITHM, false, ['encrypt', 'decrypt']);
  }

  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  const keyMaterial = btoa(String.fromCharCode(...new Uint8Array(exported)));

  // Store in Dexie (single storage layer)
  await db.appSettings.update('default', { encryptionKeyMaterial: keyMaterial });

  return key;
}

export async function encrypt(plainText: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await getOrCreateKey();
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
```

---

## 8. AI Analysis — Prompt & Workflows

### 8.1 The Prompt (Verbatim)

```
You are an expert meeting notes assistant. Create comprehensive, thematically-organized notes capturing ALL important information.

**Meeting Content:**
"""
${text}
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

**Critical:** Capture EVERYTHING important. Include specific names, numbers, quotes. Group by themes. Don't over-summarize.

Return ONLY valid JSON, no markdown code blocks.
```

The `${text}` placeholder is replaced at runtime with meeting content.

### 8.2 What Goes Into `${text}`

The text sent to Claude is constructed as follows:

1. **If meeting has transcripts**: Auto-merge all transcript utterances in chronological order, including speaker labels:
   ```
   Speaker A: Hello everyone, thanks for joining.
   Speaker B: Thanks for having me. I've prepared the slides.
   ...
   ```
   If the user has renamed speakers, use real names instead of A/B/C.

2. **If meeting has manual notes only**: The TipTap editor content converted to plain text via `editor.getText()` (TipTap's built-in method that strips JSON/HTML to plain text). This conversion happens in the **component** that prepares the analysis input (e.g., `useAnalysis` hook or `AnalysisPanel`), NOT inside `claudeService.analyze()` — the service receives ready-to-use plain text.

3. **If meeting has both**: Transcripts first, then notes below with a separator:
   ```
   [Transcript]
   Speaker A: ...

   ---

   [Notes]
   (plain text from TipTap)
   ```

The user can edit the combined text in a textarea before running analysis.

### 8.3 Workflow 1 — API (Primary)

```
User clicks "Analyze" on Analysis tab
    │
    ▼
Collect & merge text (transcripts with speaker labels + notes)
    │
    ▼
Show editable textarea with combined text (user can clean up)
    │
    ▼
User clicks "Run Analysis"
    │
    ▼
Inject text into prompt template (replace ${text})
    │
    ▼
Call Claude API via @anthropic-ai/sdk
  ├── model: claude-sonnet-4-5-20250929
  ├── max_tokens: 4096
  └── dangerouslyAllowBrowser: true
    │
    ▼
Parse JSON response → validate required fields
    │
    ▼
Soft-delete any existing MeetingAnalysis for this meeting
    │
    ▼
Store new MeetingAnalysis in IndexedDB (sourceType: 'api')
    │
    ▼
Queue for sync
    │
    ▼
Display analysis in AnalysisPanel
```

### 8.4 Workflow 2 — Copy-Paste Fallback

Used when no API key is configured, or when the API call fails.

```
User clicks "Analyze" (no API key) OR API call fails
    │
    ▼
Open CopyPasteModal dialog
    │
    ▼
Modal displays the FULL prompt with meeting text already injected
    │
    ├── "Copy Prompt" button → copies to clipboard
    │
    ▼
User pastes prompt into Claude (claude.ai, Claude app, etc.)
    │
    ▼
User receives JSON response from Claude
    │
    ▼
User pastes JSON back into the "Paste Result" textarea
    │
    ├── "Parse & Save" button
    │
    ▼
App parses JSON → validates → soft-deletes old analysis → stores new (sourceType: 'manual')
    │
    ▼
Display analysis in AnalysisPanel
```

### 8.5 Re-run Analysis

When the user edits notes or gets new transcripts, they can re-run analysis:
- The existing `MeetingAnalysis` gets soft-deleted (`deletedAt` set)
- A new `MeetingAnalysis` is created
- The "Analyze" button shows as "Re-analyze" when an analysis already exists

---

## 9. Audio Recording & Transcription (AssemblyAI)

### 9.1 Recording Flow

```
User opens Audio tab → clicks ● Record
    │
    ▼
Acquire Wake Lock (screen stays on)
    │
    ▼
getUserMedia({ audio: { echoCancellation, noiseSuppression, sampleRate: 16000 } })
    │
    ▼
MediaRecorder.start(1000)  // Chunk every 1 second
    │
    ├── ondataavailable → push to in-memory chunks[]
    │                    → persist chunk to audioChunkBuffers in Dexie (crash recovery)
    │
    ▼
Recording controls visible:
    ⏸ Pause  │  ▶ Resume  │  ⏹ Stop
    Online/offline indicator shown
    │
    ▼
User clicks ⏹ Stop
    │
    ▼
Create Blob from chunks → validate (min 2s, min 1KB)
    │
    ▼
Save AudioRecording to Dexie (with meetingId, order number)
    │
    ▼
Clear audioChunkBuffers for this session
    │
    ▼
If online → start transcription (Section 9.2)
If offline → show "Transcribe when online" button
```

### 9.2 Transcription Flow (Post-Recording)

```
Upload audio blob to AssemblyAI
    │
    ├── Upload progress bar (0% → 100%) via XHR
    │
    ▼
Request transcription with speaker_labels: true
    │
    ▼
Poll every 1 second (up to 3 minutes)
    │
    ├── Status indicator: "Uploading..." → "Transcribing..." → "Complete!"
    │   with elapsed time counter
    │
    ▼
Receive result: utterances with speaker labels, full text, confidence
    │
    ▼
Store Transcript in Dexie (full response cached locally)
    │
    ▼
Show speaker rename panel: Speaker A → [___], Speaker B → [___]
    │
    ▼
Release Wake Lock
```

### 9.3 Crash Recovery

When opening a meeting, check for orphaned `audioChunkBuffers`:

```
MeetingDetailPage loads
    │
    ▼
AudioRecorderService.getOrphanedSessions(meetingId)
    │
    ├── If orphaned sessions found:
    │   Show RecordingRecoveryDialog:
    │   "We found an interrupted recording. Recover it?"
    │   [Recover] → reconstruct Blob → save as AudioRecording
    │   [Discard] → delete chunk buffers
    │
    ▼
Continue normally
```

### 9.4 Multiple Recordings Per Meeting

- Each meeting can have multiple `AudioRecording` entries (ordered by `order` field)
- Each recording has its own `Transcript` after transcription
- The Audio tab shows a list of all recordings with individual play/transcribe controls
- For AI analysis, all transcripts are auto-merged chronologically into one combined text
- The combined text is shown in an editable textarea before analysis so the user can clean up overlaps or remove junk

### 9.5 Audio Format Reference

| Browser | MIME Type | Notes |
|---|---|---|
| Chrome / Edge | `audio/webm;codecs=opus` | Preferred |
| Firefox | `audio/webm;codecs=opus` | Preferred |
| Safari (macOS) | `audio/mp4` | Only option |
| Safari (iOS) | `audio/mp4` | Only option, limited MediaRecorder support |

Bitrate: 128kbps. Chunk interval: 1 second.

### 9.6 Page Close Guard (beforeunload)

When a recording is active, register a `beforeunload` event listener to warn the user before they accidentally close the tab or navigate away:

```typescript
// In useAudioRecorder hook or MeetingDetailPage
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (audioRecorderService.isRecording() || audioRecorderService.isPaused()) {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome — shows browser's default "Leave site?" dialog
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, []);
```

This covers accidental tab close. For in-app navigation (React Router), use a `useBlocker` or `<Prompt>` equivalent to warn when navigating away from a meeting with an active recording.

---

## 10. Stakeholder Management

### 10.1 MVP Scope

| Feature | Details |
|---|---|
| **Stakeholder CRUD** | Create, edit, soft-delete stakeholders with name, email, phone, organization, notes |
| **Category Management** | Create, edit, soft-delete categories with name and color (from preset palette) |
| **Multiple Categories** | A stakeholder can belong to multiple categories (multi-select chips) |
| **Color-coded Badges** | Categories shown as colored badges/chips throughout the app |
| **Link to Meetings** | Associate stakeholders with meetings via `stakeholderIds[]` on Meeting |
| **StakeholderPicker** | Searchable multi-select component for linking stakeholders when editing a meeting |
| **View by Stakeholder** | Stakeholder detail page shows all linked meetings |
| **Search** | Search stakeholders by name, organization, category |
| **Dashboard Filtering** | Filter meeting card grid by stakeholder or stakeholder category |

### 10.2 Phase 2 Scope

| Feature | Details |
|---|---|
| **Relationship Health** | Health score (good/needs attention/at risk) with manual or auto tracking |
| **Last Contact Date** | Auto-calculated from most recent linked meeting date |

### 10.3 Stakeholder Routes

| Route | Page |
|---|---|
| `/stakeholders` | List page: card grid of stakeholders, search bar, category filter |
| `/stakeholders/:id` | Detail page: stakeholder info, category badges, linked meetings list |

### 10.4 StakeholderPicker Component

Used on the Meeting Detail page metadata section:

```
Stakeholders: [ Sudhanshu × ] [ John × ] [ + Add ]
                  ↓
              ┌──────────────────────┐
              │ Search stakeholders  │
              │ ───────────────────  │
              │ ☑ Sudhanshu (Investor) │
              │ ☑ John (School)       │
              │ ☐ Sarah (Partner)     │
              │ ☐ Mike (Investor)     │
              │ ─────────────────── │
              │ [+ Create new]       │
              └──────────────────────┘
```

---

## 11. Cloud Backup (Cloudflare D1 + Workers)

### 11.1 Architecture

```
SmartMeetings PWA (Browser)
    │
    │  Manual "Sync" button click
    │
    ▼
Dexie syncQueue table (outbox)
    │
    │  flush pending changes via fetch
    │
    ▼
Cloudflare Worker (3 endpoints)
    │
    ▼
Cloudflare D1 (SQLite)
```

**One-way sync**: Local → Cloud. Last-write-wins. No conflict resolution. No realtime. No SDKs.

**Auth**: Simple bearer token (shared secret). Single user for now.

### 11.2 Cloudflare Worker Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/push` | Push changed records from local outbox to D1 |
| `GET` | `/pull?since=ISO_DATE` | Pull records updated after a given timestamp (for recovery/new device) |
| `GET` | `/status` | Returns sync health: record counts, last sync timestamp |

**POST /push** request body:
```json
{
  "changes": [
    {
      "entity": "meeting",
      "entityId": "uuid-123",
      "operation": "create",
      "payload": "{ ... JSON of full record ... }",
      "timestamp": "2026-02-06T10:30:00Z"
    }
  ]
}
```

**POST /push** behavior: For each change, upsert into D1 table. If the incoming `timestamp` is newer than the stored `updatedAt`, overwrite. Otherwise ignore (last-write-wins).

> **Timestamp precision note**: JavaScript `Date` objects have millisecond granularity. In the extremely unlikely case of two changes within the same millisecond (e.g., during a bulk import), last-write-wins becomes non-deterministic. This is acceptable for a single-user MVP — do not add a version counter to solve this unless it causes real problems (lesson 5).

**GET /pull** response:
```json
{
  "meetings": [...],
  "stakeholders": [...],
  "stakeholderCategories": [...],
  "transcripts": [...],
  "meetingAnalyses": [...]
}
```

Note: Audio blobs are NOT synced to cloud (too large). Only metadata and text content.

### 11.3 Client-Side Outbox

Every create/update/delete in any repository adds an entry to `syncQueue` in Dexie:
- `syncedAt: null` = pending
- User clicks "Sync" button in nav → `syncService.pushChanges()` flushes all pending
- Sync button shows pending count badge: `[Sync (3)]`
- After sync: toast notification with results ("Synced 3 changes" or "2 failed")

### 11.4 Manual JSON Backup

Separate from cloud sync. Available in Settings → Export:
- "Export All Data" → downloads a JSON file with all Dexie tables (excluding audio blobs)
- "Import Data" → upload a JSON file, merge into Dexie
- This is the safety net independent of cloud sync

---

## 12. PWA Configuration

### 12.1 vite-plugin-pwa Config

```typescript
// vite.config.ts (PWA section)
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',    // Show update notification — safer for data-heavy PWA
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'SmartMeetings',
        short_name: 'SmartMeetings',
        description: 'Intelligent meeting notes with AI-powered analysis',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.assemblyai\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/api\.anthropic\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
```

### 12.2 Offline UX Strategy

| Feature | Offline Behavior |
|---|---|
| **Meeting CRUD** | Fully functional |
| **Rich text editing** | Fully functional |
| **Search & filter** | Fully functional |
| **Audio recording** | Fully functional (local MediaRecorder) |
| **Audio transcription** | Disabled — "Requires internet" tooltip |
| **AI analysis (API)** | Disabled — "Requires internet" tooltip |
| **AI analysis (copy-paste)** | Available — user can copy prompt offline |
| **Cloud sync** | Disabled — changes queue in outbox, sync when online |
| **Stakeholder management** | Fully functional |
| **Settings** | Fully functional |
| **Export** | Fully functional (local data) |

**OfflineIndicator**: Persistent banner at top of viewport when offline. Uses `OnlineContext` (listens to `online`/`offline` events on `window`).

### 12.3 Mobile Strategy (iOS PWA Limitations)

Mobile is **capture-only mode**:

| Feature | Mobile | Desktop |
|---|---|---|
| Record audio | Yes (simplified controls) | Yes (full controls) |
| Quick notes (basic text) | Yes | Yes (rich TipTap editor) |
| View meetings list | Yes | Yes (full card grid + filters) |
| View analysis results | Yes (read-only) | Yes |
| Transcription | No — do on desktop | Yes |
| AI analysis | No — do on desktop | Yes |
| Stakeholder management | View only | Full CRUD |
| Cloud sync | Yes (manual) | Yes (manual) |
| Export | No — do on desktop | Yes |

**Implementation**: Mobile detection uses a `useIsMobile()` hook based on CSS media query matching, NOT user-agent sniffing:

```typescript
// shared/hooks/useIsMobile.ts
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
```

Components use `useIsMobile()` for conditional rendering. Features marked "No" on mobile are hidden (not rendered), not just disabled. The "No — do on desktop" features show a brief message like "Open on desktop to transcribe" instead of hiding silently.

Always check iOS compatibility before implementing any feature. Known issues:
- MediaRecorder support is limited on iOS Safari (audio/mp4 only)
- IndexedDB has storage limits on iOS
- No background processing when PWA is backgrounded
- Screen Wake Lock behavior varies

---

## 13. Export

### 13.1 Export Capabilities

| Export Type | Format | Scope | MVP? |
|---|---|---|---|
| **Single meeting** | JSON | One meeting + related transcripts, analyses | Yes |
| **Single meeting** | PDF | Print-friendly view via browser Ctrl+P | Yes |
| **All data backup** | JSON | All Dexie tables (excluding audio blobs) | Yes |
| **Bulk meetings** | JSON | User selects multiple meetings | Yes |

### 13.2 PDF Export (Browser Print-to-PDF)

No JS library. Use `@media print` CSS to create a clean print layout:

```
Print view includes:
- Meeting title, date, status
- Stakeholders with category badges
- Participants, tags
- Notes (rendered from TipTap JSON to HTML)
- Transcript (with speaker labels)
- AI Analysis (summary, themes, decisions, action items, open items, next steps)
```

"Export as PDF" button triggers `window.print()` with a print-optimized stylesheet. User saves via browser's print dialog.

### 13.3 JSON Export Structure

```json
{
  "exportedAt": "2026-02-06T10:30:00Z",
  "version": "1.0",
  "meetings": [...],
  "stakeholders": [...],
  "stakeholderCategories": [...],
  "transcripts": [...],
  "meetingAnalyses": [...]
}
```

Audio blobs are excluded from JSON export (too large). Transcript text is included.

### 13.4 Manual Backup (Settings Page)

- **"Export All Data"** button → downloads `smartmeetings-backup-YYYY-MM-DD.json`
- **"Import Data"** button → file picker for JSON → merge into Dexie (last-write-wins by `updatedAt`)
- This is independent from cloud sync — a manual safety net

---

## 14. Phased Roadmap

### Phase 1 — MVP

| Feature | Details |
|---|---|
| **Meeting CRUD** | Quick-create, edit metadata, soft-delete, trash view with restore/permanent delete |
| **Rich Text Editor** | TipTap with headings, lists, bold, italic, code blocks. JSON format. Auto-save (3s debounce) |
| **Manual Notes Workflow** | Paste notes into editor → run AI analysis → view results. Same analysis flow as audio |
| **Audio Recording** | Start/pause/resume/stop. Periodic chunk saving. Crash recovery dialog. Multiple recordings per meeting |
| **Audio Transcription** | AssemblyAI batch upload with speaker diarization. Upload progress bar. Status step indicator. Speaker rename UI |
| **Wake Lock** | Screen stays awake during recording + upload + transcription. Silent audio fallback for unsupported browsers |
| **AI Analysis** | Claude API + copy-paste fallback. Editable input text before analysis. Soft-replace on re-run |
| **Stakeholder Management** | CRUD for stakeholders and categories. Color-coded badges (preset palette). Link to meetings. Dedicated pages |
| **Search & Filtering** | Full-text search (300ms debounce). Filter by status, stakeholder, category, tags, date range. Sort by date/title |
| **Dashboard** | Card grid with collapsible date sections (This Week, Last Week, Month, Year). Empty state with onboarding hints |
| **Cloud Backup** | Cloudflare D1 + Workers. Outbox pattern. Manual sync button. Push/pull/status endpoints. Bearer token auth |
| **Manual Backup** | Export/import all data as JSON from Settings |
| **Export** | Per-meeting JSON. Bulk JSON. Browser print-to-PDF |
| **PWA** | Installable, offline CRUD/notes/search, Workbox service worker |
| **Theming** | Light/dark/system. Toggle in nav bar. Stored in Dexie |
| **Mobile** | Capture-only: record audio + quick notes + view meetings |

### Phase 2 — Enhanced

| Feature | Details |
|---|---|
| **Deepgram Integration** | Add as alternative transcription provider |
| **AssemblyAI WebSocket** | Real-time live preview during recording (without speaker labels) |
| **Stakeholder Health** | Relationship health tracking, last contact date |
| **Meeting Templates** | Reusable templates (standup, 1:1, sprint planning) |
| **Advanced Search** | Web Worker with MiniSearch for faster full-text search at scale |
| **Calendar Integration** | Google Calendar, Outlook — import meetings |
| **Analytics Dashboard** | Meeting frequency, action item completion rates |

### Phase 3 — Platform

| Feature | Details |
|---|---|
| **Real-time Collaboration** | Y.js + y-dexie for concurrent editing |
| **Video Platform Integration** | Zoom, Teams, Google Meet auto-import |
| **Custom Prompt Management** | UI to create/edit/select AI analysis prompt templates |
| **Multi-user Cloud Sync** | Proper auth, per-user data, sharing |

---

## 15. Dependencies

### 15.1 Production Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "@tiptap/react": "^2.6.0",
    "@tiptap/starter-kit": "^2.6.0",
    "@tiptap/extension-placeholder": "^2.6.0",
    "@tiptap/extension-highlight": "^2.6.0",
    "@tiptap/extension-task-list": "^2.6.0",
    "@tiptap/extension-task-item": "^2.6.0",
    "dexie": "^4.0.0",
    "dexie-react-hooks": "^1.1.0",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.400.0"
  }
}
```

No Zustand. No AssemblyAI SDK (raw fetch calls). No PDF library. No sync SDK.

### 15.2 Dev Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite-plugin-pwa": "^0.20.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^24.1.0",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "prettier": "^3.3.0"
  }
}
```

---

## 16. Testing & Error Handling

### 16.1 Testing Strategy

| Layer | Tool | What to Test |
|---|---|---|
| **Unit** | Vitest | Services (claudeService, assemblyaiService, encryption, syncService), utilities |
| **Component** | Vitest + Testing Library | Component rendering, user interactions, form validation |
| **Integration** | Vitest + fake-indexeddb | Full CRUD flows, soft delete/restore, sync queue operations |
| **E2E** (Phase 2) | Playwright | Critical journeys: create meeting → record → transcribe → analyze |

**Key test scenarios for MVP**:
- Meeting CRUD: create, read, update, soft-delete, restore, permanent delete
- Stakeholder CRUD: create, edit, soft-delete, category linkage
- Encryption round-trip: encrypt → decrypt returns original
- Claude service: prompt construction with speaker labels, JSON parsing, malformed response handling
- Copy-paste modal: prompt generation, JSON validation on paste-back
- Audio recorder: MIME type detection, start/pause/resume/stop, chunk persistence
- Crash recovery: detect orphaned sessions, reconstruct blob from chunks
- AssemblyAI service: upload progress, poll status transitions, timeout handling
- Speaker rename: update speakerMap, verify mapped names in transcript display
- Sync queue: changes are queued, pushChanges flushes correctly, errors tracked
- Search: full-text matching, debounce, filter by stakeholder/status/tags
- Offline detection: API buttons disabled, sync button disabled, banner shown
- Soft delete: deletedAt set, record hidden from normal queries, visible in trash

### 16.2 Error Handling Patterns

| Scenario | Handling |
|---|---|
| **Claude API failure** | Toast with error, auto-open copy-paste fallback modal |
| **AssemblyAI upload failure** | Toast with error, "Retry upload" button. Audio blob is safe in Dexie |
| **AssemblyAI transcription error** | Toast with AssemblyAI error message, suggest re-uploading |
| **AssemblyAI timeout (>3 min)** | Toast "Transcription is taking longer than expected", offer to check back later |
| **Invalid JSON from AI** | Toast "Failed to parse analysis", log raw response |
| **Invalid JSON from manual paste** | Inline error in CopyPasteModal with specific parse error |
| **Microphone permission denied** | Toast "Microphone access required", link to browser settings help |
| **Wake Lock failure** | Silent fallback to audio keep-alive. No user-facing error |
| **IndexedDB quota exceeded** | Toast "Storage full — export and delete old meetings" |
| **Offline + API action** | Button disabled with tooltip "Requires internet connection" |
| **API key not configured** | Navigate to Settings with highlight on missing key field |
| **Cloud sync failure** | Toast with error count, mark failed items in syncQueue for retry |
| **Audio recording crash** | On next visit: RecoveryDialog offering to restore partial recording |
| **Recording too short** | Toast "Recording too short (minimum 2 seconds)" |

### 16.3 Auto-Save Strategy

- TipTap editor content debounce-saved to Dexie every **3 seconds** after last keystroke
- Meeting metadata (title, participants, tags, stakeholders) saves on blur
- "Saving..." / "Saved" indicator in editor toolbar
- On `beforeunload`: force immediate save if pending changes
- On `beforeunload`: warn user if audio recording is active (see Section 9.6)
- Every save queues a sync entry in the outbox
