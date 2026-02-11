# SmartMeetings — Root Cause Analysis: Old MeetingFlow vs New SmartMeetings

> Comparative analysis of recording, transcription, and upload implementations.
> Reference: Old app at `meetingflow-app/src/components/MobileRecorder.jsx`
> Last updated: 2026-02-11

---

## Executive Summary

The OLD MeetingFlow app had critical reliability issues that caused data loss, failed uploads, and broken recordings — particularly on iOS. The NEW SmartMeetings app was built with lessons learned from these failures, implementing defensive coding patterns focused on preventing data loss and handling edge cases that crashed the old system.

---

## 1. Audio Recording

### Old App (MeetingFlow)

**File:** `meetingflow-app/src/components/MobileRecorder.jsx`

**How it worked:**
- Single MediaRecorder instance with `start(1000)` — chunks every 1 second
- `ondataavailable` pushed chunks to array in memory
- `onstop` handler created Blob from chunks, then immediately uploaded
- Wake lock acquired at start, released after upload
- Visibility change handler re-acquired wake lock

**Problems that caused data loss:**
1. **iOS Safari Race Condition**: `onstop` sometimes fired before `ondataavailable` completed — losing final audio chunks
2. **No Timeout Fallback**: If iOS Safari didn't fire `onstop` (known bug), recording hung forever in "uploading" state
3. **Screen Lock During Upload**: Wake lock released right after stop, but uploads took 30+ seconds on slow connections — screen would lock and kill the upload
4. **Single Recording Per Session**: No way to record multiple times; had to upload before trying again
5. **Data Loss On Crash**: Chunks only in memory — browser crash = audio gone

**Old code pattern:**
```javascript
recorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    chunksRef.current.push(event.data)  // Memory only - no persistence
  }
}

recorder.onstop = async () => {
  const blob = new Blob(chunksRef.current, { type: mimeType })
  uploadAudio(blob)  // Immediate upload, no fallback
}
```

### New App (SmartMeetings)

**File:** `src/services/audioRecorderService.ts`

**What changed:**
- **Triple fallback stop mechanism** with dedup flag:
  - Trigger 1: `onstop` event (normal path)
  - Trigger 2: `ondataavailable` when MediaRecorder state is `inactive` (iOS fallback)
  - Trigger 3: 3-second timeout if neither fired (last resort)
- `onstop` registered BEFORE `stop()` called — iOS fires synchronously
- Chunks stay in MEMORY during recording (no IndexedDB writes — proven more reliable on iOS)
- IndexedDB persist is NON-FATAL — recording returned even if DB write fails
- Supports pause/resume and multiple recordings per meeting
- Crash recovery via `recoverSession()` and `getOrphanedSessions()` static methods

**New code pattern:**
```typescript
let settled = false;  // Dedup flag — ensures processing runs exactly once

const processRecording = async () => {
  if (settled) return;
  settled = true;
  // ... create blob, validate, save, return
};

// Trigger 1: normal onstop
this.mediaRecorder.onstop = () => processRecording();

// Trigger 2: ondataavailable fallback (iOS)
this.mediaRecorder.ondataavailable = (event) => {
  if (origOnData) origOnData.call(this.mediaRecorder!, event);
  if (this.mediaRecorder?.state === 'inactive' && !settled) {
    processRecording();
  }
};

// Trigger 3: 3-second timeout
setTimeout(() => {
  if (!settled && this.chunks.length > 0) {
    processRecording();
  }
}, 3000);
```

---

## 2. AssemblyAI Upload & Transcription

### Old App

**Files:** `meetingflow-app/src/utils/resilientUpload.js`, `MobileRecorder.jsx` (lines 276-389)

**How it worked:**
- XMLHttpRequest upload with 90s timeout
- Transcript request with 30s timeout
- **NO POLLING** — just returned transcript ID and hoped for the best
- localStorage stored transcript ID for "recovery"
- 3 retries with 2-second delay

**Critical failures:**
1. **No Polling**: After creating the transcript job, the app never checked if it completed. Mobile user got a transcript ID but no actual transcript.
2. **localStorage Mixing**: Stored transcript ID in both localStorage and callback — inconsistent, lost on browser clear
3. **Silent Failure**: If all retries exhausted, just showed error with no recovery path
4. **No Transcript Retrieval**: Had transcript ID but no code to fetch the actual result

**Old code pattern:**
```javascript
export async function uploadAndTranscribe(blob, apiKey) {
  const uploadResult = await uploadWithProgress(...)
  const uploadUrl = uploadResult.upload_url

  const transcriptResponse = await fetchWithTimeout(
    'https://api.assemblyai.com/v2/transcript',
    { body: JSON.stringify({ audio_url: uploadUrl, speaker_labels: true }) },
    30000
  )

  const transcriptId = transcriptResponse.id

  // NO POLLING — just return and hope for the best
  return { uploadUrl, transcriptId }
}
```

### New App

**File:** `src/services/assemblyaiService.ts`

**What changed:**
- **Full polling pipeline**: upload → request → poll every 1s up to 3 minutes
- Real-time status callbacks at each step: "Uploading..." → "Transcribing..." → "Complete!"
- Explicit error states from AssemblyAI surfaced to user
- API key loaded from encrypted Dexie storage (not env variable)
- Returns complete transcript with utterances, speakers, confidence scores
- **Mobile strategy**: upload + create job + display transcript ID (no polling — user imports on desktop)
- **Desktop strategy**: full poll with status tracking

**New code pattern:**
```typescript
async pollForResult(transcriptId, callbacks): Promise<TranscriptionResult> {
  let attempts = 0;

  while (attempts < 180) {  // 3 minutes max
    const response = await fetch(`/v2/transcript/${transcriptId}`, ...);
    const data = await response.json();

    if (data.status === 'completed') {
      callbacks.onStatusChange('completed', 'Transcription complete!');
      return { transcriptId, text: data.text, utterances: data.utterances, ... };
    }

    if (data.status === 'error') {
      callbacks.onStatusChange('error', data.error);
      throw new Error(`Transcription error: ${data.error}`);
    }

    callbacks.onStatusChange('processing', `Transcribing... (${attempts}s elapsed)`);
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  throw new Error('Transcription timed out after 3 minutes');
}
```

---

## 3. Mobile Recording

### Old App

**Limitations:**
- No pause/resume — had to stop and start over
- No meeting context — couldn't associate recordings with meetings
- One recording at a time, must upload before next
- No desktop sync — recording was mobile-only
- No transcript polling — had transcript ID but couldn't get actual transcript
- localStorage for recovery (fragile)

### New App

**File:** `src/features/mobile/MobileApp.tsx`

**What changed:**
- Proper state machine: `setup → idle → recording → paused → finalizing → uploading → done → error`
- Pause/Resume support without data loss
- Wake lock re-acquired on `visibilitychange` (iOS releases when backgrounded)
- Connectivity check before uploading
- 3 retries with 2s delay on upload failure
- **Save-to-device fallback** when upload fails (download audio as .mp4/.webm file)
- Transcript ID displayed for manual import on desktop
- API key configuration in settings overlay (encrypted in Dexie)

---

## 4. Wake Lock

### Old App

- Wake Lock API only, no fallback
- Released immediately after recording stopped
- No re-acquisition on visibility change

### New App

**File:** `src/services/wakeLockService.ts`

- Primary: `navigator.wakeLock.request('screen')`
- Fallback: silent audio loop (data URI, volume 0.01) for browsers without Wake Lock API
- Re-acquired on `visibilitychange` (critical for iOS which releases wake lock when backgrounded)
- Kept active during recording AND upload AND transcription

---

## 5. AI Analysis (Claude)

### Old App

- Used `claude-3-haiku-20240307` — fast, cheap
- Simple prompt, reasonable response times

### New App (initial build — WRONG)

- Used `claude-sonnet-4-5-20250929` — heavy reasoning model, 5-15x slower
- max_tokens: 4096 (too low for 60-min meetings)
- temperature: default 1.0 (high randomness)
- Prompt said "Capture EVERYTHING" — produced verbose output that hit token limits

### New App (after RCA fix)

**File:** `src/services/claudeService.ts`

- Model: `claude-haiku-4-5-20251001` — equivalent speed to old app's Haiku
- max_tokens: 12288 — handles 60-minute meetings
- temperature: 0.1 — deterministic, structured output
- Prompt: concise instructions (5-8 themes, 3-5 keyPoints max, 1 sentence each)
- Input capped at 60,000 chars (~15K tokens) via `prepareAnalysisText()`
- Truncation detection: checks `stop_reason === 'max_tokens'`
- Markdown code fence stripping for robust JSON parsing

---

## 6. Comparative Table

| Feature | Old App | New App | Improvement |
|---------|---------|---------|-------------|
| **Recording Stop** | Single onstop trigger, can hang | Triple fallback with dedup (3s max) | Eliminates iOS race conditions |
| **Data Persistence** | Memory only | Memory + non-fatal IndexedDB persist | Crash recovery without hanging |
| **Pause/Resume** | Not supported | Full support with state tracking | Multiple takes per meeting |
| **Transcription Polling** | None — silent failure | Full 3-min polling with status callbacks | User knows if transcription succeeded |
| **Upload Retries** | 3 retries, 2s delay | 3 retries, 2s delay + save-to-device fallback | Always a recovery path |
| **Wake Lock** | API only, no fallback | API + silent audio + visibility re-acquire | Screen stays awake through upload on iOS |
| **Multi-Recording** | No | Yes, with order tracking | Multiple recordings per meeting |
| **API Key Storage** | localStorage / env var | Encrypted Dexie (AES-GCM-256) | Secure, single storage layer |
| **Error Recovery** | Download as last resort | Error states + retry + download + transcript ID | Better user experience |
| **Non-Fatal Errors** | Silent IndexedDB failures | Explicit handling, recording still returned | No phantom hangs |
| **AI Model** | claude-3-haiku (fast) | claude-haiku-4-5 (fast) | Same speed tier, newer model |
| **Storage Layer** | Mixed (localStorage + IndexedDB) | Dexie only (zero exceptions) | No data inconsistency |

---

## 7. Key Lessons (Applied in New App)

1. **NEVER use async callback inside Promise constructor without try/catch** — iOS fires callbacks synchronously
2. **Register onstop BEFORE calling stop()** — iOS Safari fires synchronously
3. **ondataavailable: memory push only, no IndexedDB writes** — proven more reliable on iOS
4. **Triple fallback on stop** — onstop + ondataavailable-inactive + 3s timeout with dedup flag
5. **IndexedDB persist is NON-FATAL** — recording returned even if DB write fails
6. **Wake Lock: re-acquire on visibilitychange** — iOS releases when backgrounded
7. **Upload: 3 retries, 2s delay, 90s XHR timeout** — keep wake lock active through upload
8. **Save-to-device download as emergency fallback** — user should never lose their audio
9. **ONE storage layer** — Dexie only, no localStorage mixing
10. **Manual sync only** — no auto-sync, no complicated conflict resolution
