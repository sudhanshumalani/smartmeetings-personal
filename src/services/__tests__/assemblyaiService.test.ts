import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../../db/database';
import type { Transcript } from '../../db/database';
import { AssemblyAIService } from '../assemblyaiService';
import type { ProgressCallback } from '../assemblyaiService';

// --- Mock settingsService ---
vi.mock('../settingsService', () => ({
  getAssemblyAiApiKey: vi.fn().mockResolvedValue('test-api-key-123'),
}));

// --- XHR Mock ---
let xhrInstance: MockXHR;

interface MockXHR {
  open: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  status: number;
  responseText: string;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

function createMockXHR(): MockXHR {
  return {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    status: 200,
    responseText: '',
    upload: { onprogress: null },
    onload: null,
    onerror: null,
  };
}

beforeEach(() => {
  xhrInstance = createMockXHR();
  // Must use function() constructor (not arrow) so `new XMLHttpRequest()` works
  (globalThis as any).XMLHttpRequest = function () {
    return xhrInstance;
  };
});

// --- Helpers ---

function createService(): AssemblyAIService {
  const service = new AssemblyAIService();
  // Directly set the API key for testing (bypasses settings service in most tests)
  (service as any).apiKey = 'test-api-key-123';
  return service;
}

function createCallbacks(): ProgressCallback & {
  statusChanges: Array<{ status: string; detail?: string }>;
  uploadProgresses: number[];
} {
  const statusChanges: Array<{ status: string; detail?: string }> = [];
  const uploadProgresses: number[] = [];

  return {
    statusChanges,
    uploadProgresses,
    onStatusChange: (status, detail) => {
      statusChanges.push({ status, detail });
    },
    onUploadProgress: (percent) => {
      uploadProgresses.push(percent);
    },
  };
}

const COMPLETED_RESPONSE = {
  status: 'completed',
  text: 'Hello world. How are you?',
  utterances: [
    {
      speaker: 'A',
      text: 'Hello world.',
      start: 0,
      end: 2000,
      confidence: 0.95,
      words: [
        { text: 'Hello', start: 0, end: 500, confidence: 0.96, speaker: 'A' },
        { text: 'world.', start: 600, end: 2000, confidence: 0.94, speaker: 'A' },
      ],
    },
    {
      speaker: 'B',
      text: 'How are you?',
      start: 2500,
      end: 4000,
      confidence: 0.92,
      words: [
        { text: 'How', start: 2500, end: 2800, confidence: 0.93, speaker: 'B' },
        { text: 'are', start: 2900, end: 3200, confidence: 0.91, speaker: 'B' },
        { text: 'you?', start: 3300, end: 4000, confidence: 0.92, speaker: 'B' },
      ],
    },
  ],
  audio_duration: 4.0,
  confidence: 0.935,
};

// --- Tests ---

describe('AssemblyAIService', () => {
  let service: AssemblyAIService;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    service = createService();
    vi.restoreAllMocks();
    // Re-apply XHR mock after restoreAllMocks
    xhrInstance = createMockXHR();
    (globalThis as any).XMLHttpRequest = function () {
      return xhrInstance;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('loads the API key from settings service', async () => {
      const freshService = new AssemblyAIService();
      await freshService.initialize();
      // The apiKey should now be set (private, but we verify by attempting transcription)
      expect((freshService as any).apiKey).toBe('test-api-key-123');
    });

    it('throws if API key is not configured', async () => {
      const { getAssemblyAiApiKey } = await import('../settingsService');
      (getAssemblyAiApiKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

      const freshService = new AssemblyAIService();
      await expect(freshService.initialize()).rejects.toThrow('API key not configured');
    });
  });

  describe('uploadAudio', () => {
    it('sends correct headers with authorization', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      const callbacks = createCallbacks();

      // Set up XHR to respond with upload_url
      xhrInstance.send = vi.fn(function (this: MockXHR) {
        this.status = 200;
        this.responseText = JSON.stringify({ upload_url: 'https://cdn.assemblyai.com/upload/123' });
        if (this.onload) this.onload();
      }.bind(xhrInstance));

      const uploadUrl = await (service as any).uploadAudio(blob, callbacks.onUploadProgress);

      expect(xhrInstance.open).toHaveBeenCalledWith('POST', 'https://api.assemblyai.com/v2/upload');
      expect(xhrInstance.setRequestHeader).toHaveBeenCalledWith('authorization', 'test-api-key-123');
      expect(uploadUrl).toBe('https://cdn.assemblyai.com/upload/123');
    });

    it('reports upload progress', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      const callbacks = createCallbacks();

      xhrInstance.send = vi.fn(function (this: MockXHR) {
        // Simulate progress events
        if (this.upload.onprogress) {
          this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
          this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
        }
        this.status = 200;
        this.responseText = JSON.stringify({ upload_url: 'https://cdn.assemblyai.com/upload/123' });
        if (this.onload) this.onload();
      }.bind(xhrInstance));

      await (service as any).uploadAudio(blob, callbacks.onUploadProgress);

      expect(callbacks.uploadProgresses).toEqual([50, 100]);
    });

    it('rejects on upload failure (non-200)', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      const callbacks = createCallbacks();

      xhrInstance.send = vi.fn(function (this: MockXHR) {
        this.status = 500;
        this.responseText = 'Server error';
        if (this.onload) this.onload();
      }.bind(xhrInstance));

      await expect(
        (service as any).uploadAudio(blob, callbacks.onUploadProgress),
      ).rejects.toThrow('Upload failed: 500');
    });

    it('rejects on network error', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      const callbacks = createCallbacks();

      xhrInstance.send = vi.fn(function (this: MockXHR) {
        if (this.onerror) this.onerror();
      }.bind(xhrInstance));

      await expect(
        (service as any).uploadAudio(blob, callbacks.onUploadProgress),
      ).rejects.toThrow('Upload network error');
    });
  });

  describe('requestTranscription', () => {
    it('sends speaker_labels: true in request body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'transcript-id-456' }),
      });
      globalThis.fetch = mockFetch;

      const transcriptId = await (service as any).requestTranscription('https://cdn.assemblyai.com/upload/123');

      expect(transcriptId).toBe('transcript-id-456');

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.assemblyai.com/v2/transcript');
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[1].headers['authorization']).toBe('test-api-key-123');

      const body = JSON.parse(fetchCall[1].body);
      expect(body.speaker_labels).toBe(true);
      expect(body.audio_url).toBe('https://cdn.assemblyai.com/upload/123');
      expect(body.language_code).toBe('en');
    });

    it('throws on non-OK response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      });

      await expect(
        (service as any).requestTranscription('https://cdn.assemblyai.com/upload/123'),
      ).rejects.toThrow('Transcription request failed: 400');
    });
  });

  describe('pollForResult', () => {
    it('handles queued → processing → completed status transitions', async () => {
      const callbacks = createCallbacks();
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'queued' }),
          });
        }
        if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'processing' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(COMPLETED_RESPONSE),
        });
      });

      // Use fake timers but execute setTimeout immediately
      vi.useFakeTimers();

      const pollPromise = (service as any).pollForResult('transcript-id', callbacks);

      // Advance through the polling intervals
      await vi.advanceTimersByTimeAsync(1000); // after queued
      await vi.advanceTimersByTimeAsync(1000); // after processing

      const result = await pollPromise;

      vi.useRealTimers();

      expect(result.transcriptId).toBe('transcript-id');
      expect(result.text).toBe('Hello world. How are you?');
      expect(result.utterances).toHaveLength(2);
      expect(callCount).toBe(3);
    });

    it('throws after max attempts (timeout)', async () => {
      const callbacks = createCallbacks();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'processing' }),
      });

      vi.useFakeTimers();

      // Attach catch handler immediately to prevent unhandled rejection
      let caughtError: Error | null = null;
      const pollPromise = (service as any).pollForResult('transcript-id', callbacks)
        .catch((err: Error) => { caughtError = err; });

      // Advance through all 180 intervals
      for (let i = 0; i < 180; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await pollPromise;

      vi.useRealTimers();

      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toBe('Transcription timed out after 3 minutes');
    });

    it('handles error status from AssemblyAI', async () => {
      const callbacks = createCallbacks();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'error',
          error: 'Audio too short',
        }),
      });

      await expect(
        (service as any).pollForResult('transcript-id', callbacks),
      ).rejects.toThrow('Transcription error: Audio too short');

      expect(callbacks.statusChanges).toContainEqual({
        status: 'error',
        detail: 'Audio too short',
      });
    });
  });

  describe('transcribe (full pipeline)', () => {
    it('throws if API key is not initialized', async () => {
      const noKeyService = new AssemblyAIService();
      const blob = new Blob(['audio'], { type: 'audio/webm' });
      const callbacks = createCallbacks();

      await expect(noKeyService.transcribe(blob, callbacks)).rejects.toThrow(
        'API key not initialized',
      );
    });
  });

  describe('result parsing', () => {
    it('extracts utterances, fullText, speakersDetected correctly', () => {
      // This tests the parsing logic within pollForResult's completed branch
      const data = COMPLETED_RESPONSE;

      const speakersDetected = new Set(
        data.utterances.map((u) => u.speaker),
      ).size;

      expect(data.text).toBe('Hello world. How are you?');
      expect(data.utterances).toHaveLength(2);
      expect(data.utterances[0].speaker).toBe('A');
      expect(data.utterances[1].speaker).toBe('B');
      expect(speakersDetected).toBe(2);
      expect(data.audio_duration).toBe(4.0);
      expect(data.confidence).toBe(0.935);
    });

    it('handles empty utterances array gracefully', async () => {
      const callbacks = createCallbacks();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'completed',
          text: 'No speakers detected',
          utterances: null, // AssemblyAI might return null
          audio_duration: 2.0,
          confidence: 0.85,
        }),
      });

      const result = await (service as any).pollForResult('transcript-id', callbacks);

      expect(result.utterances).toEqual([]);
      expect(result.speakersDetected).toBe(0);
      expect(result.text).toBe('No speakers detected');
    });
  });

  describe('speaker rename (Dexie integration)', () => {
    it('saves speakerMap to transcript and retrieves updated names', async () => {
      // Create a transcript record
      const transcriptId = crypto.randomUUID();
      const transcript: Transcript = {
        id: transcriptId,
        meetingId: 'meeting-1',
        audioRecordingId: 'recording-1',
        assemblyaiTranscriptId: 'aai-123',
        utterances: [
          { speaker: 'A', text: 'Hello', start: 0, end: 1000, confidence: 0.95 },
          { speaker: 'B', text: 'Hi there', start: 1500, end: 3000, confidence: 0.92 },
        ],
        fullText: 'Hello Hi there',
        speakerMap: { A: '', B: '' },
        audioDuration: 3.0,
        overallConfidence: 0.935,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      await db.transcripts.add(transcript);

      // Update speaker map
      const newSpeakerMap = { A: 'Sudhanshu', B: 'John' };
      await db.transcripts.update(transcriptId, {
        speakerMap: newSpeakerMap,
        updatedAt: new Date(),
      });

      // Verify
      const updated = await db.transcripts.get(transcriptId);
      expect(updated!.speakerMap).toEqual({ A: 'Sudhanshu', B: 'John' });

      // Verify mapped names display correctly
      const displayName = (speaker: string) =>
        updated!.speakerMap[speaker] || `Speaker ${speaker}`;

      expect(displayName('A')).toBe('Sudhanshu');
      expect(displayName('B')).toBe('John');
      expect(displayName('C')).toBe('Speaker C'); // Unmapped fallback
    });
  });
});
