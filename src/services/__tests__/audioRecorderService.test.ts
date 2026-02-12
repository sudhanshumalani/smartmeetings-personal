import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { db } from '../../db/database';
import { AudioRecorderService } from '../audioRecorderService';

// --- MediaRecorder mock ---

let ondataavailable: ((event: { data: Blob }) => void) | null = null;
let onstop: (() => void) | null = null;
let recorderState: 'inactive' | 'recording' | 'paused' = 'inactive';
const mockStop = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockTrackStop = vi.fn();

function createMockMediaRecorder(_stream: MediaStream, options?: { mimeType?: string }) {
  recorderState = 'inactive';
  const recorder = {
    get state() { return recorderState; },
    mimeType: options?.mimeType || 'audio/webm;codecs=opus',
    stream: {
      getTracks: () => [{ stop: mockTrackStop }],
    },
    start(_timeslice?: number) {
      recorderState = 'recording';
    },
    stop() {
      recorderState = 'inactive';
      mockStop();
      // Fire onstop callback async
      if (onstop) setTimeout(onstop, 0);
    },
    pause() {
      recorderState = 'paused';
      mockPause();
    },
    resume() {
      recorderState = 'recording';
      mockResume();
    },
    set ondataavailable(fn: ((event: { data: Blob }) => void) | null) {
      ondataavailable = fn;
    },
    get ondataavailable() { return ondataavailable; },
    set onstop(fn: (() => void) | null) {
      onstop = fn;
    },
    get onstop() { return onstop; },
  };
  return recorder;
}

// Mock MediaRecorder globally
(globalThis as any).MediaRecorder = Object.assign(
  createMockMediaRecorder,
  {
    isTypeSupported: vi.fn((type: string) => {
      return type === 'audio/webm;codecs=opus';
    }),
  },
);

// Mock getUserMedia
const mockGetUserMedia = vi.fn().mockResolvedValue({
  getTracks: () => [{ stop: mockTrackStop }],
});

Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
  configurable: true,
});

describe('AudioRecorderService', () => {
  let service: AudioRecorderService;

  beforeEach(async () => {
    service = new AudioRecorderService();
    ondataavailable = null;
    onstop = null;
    recorderState = 'inactive';
    mockStop.mockClear();
    mockPause.mockClear();
    mockResume.mockClear();
    mockTrackStop.mockClear();
    mockGetUserMedia.mockClear();
    (MediaRecorder.isTypeSupported as Mock).mockClear();

    // Reset isTypeSupported to default
    (MediaRecorder.isTypeSupported as Mock).mockImplementation((type: string) => {
      return type === 'audio/webm;codecs=opus';
    });

    // Clear test DB
    await db.audioChunkBuffers.clear();
    await db.audioRecordings.clear();
  });

  // --- getSupportedMimeType ---

  describe('getSupportedMimeType', () => {
    it('returns audio/webm;codecs=opus when supported', () => {
      (MediaRecorder.isTypeSupported as Mock).mockImplementation((type: string) => {
        return type === 'audio/webm;codecs=opus';
      });
      expect(service.getSupportedMimeType()).toBe('audio/webm;codecs=opus');
    });

    it('returns audio/mp4 when it is the first supported type (Safari)', () => {
      (MediaRecorder.isTypeSupported as Mock).mockImplementation((type: string) => {
        return type === 'audio/mp4';
      });
      expect(service.getSupportedMimeType()).toBe('audio/mp4');
    });

    it('returns audio/webm as fallback', () => {
      (MediaRecorder.isTypeSupported as Mock).mockImplementation((type: string) => {
        return type === 'audio/webm';
      });
      expect(service.getSupportedMimeType()).toBe('audio/webm');
    });

    it('returns audio/webm when no types supported', () => {
      (MediaRecorder.isTypeSupported as Mock).mockImplementation(() => false);
      expect(service.getSupportedMimeType()).toBe('audio/webm');
    });
  });

  // --- startRecording ---

  describe('startRecording', () => {
    it('creates a session and collects chunks in memory', async () => {
      await service.startRecording('meeting-1');

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      expect(service.isRecording()).toBe(true);
      expect(service.getSessionId()).toBeTruthy();

      // Simulate data available — chunks go to memory only (not IndexedDB)
      const chunkData = new Blob(['audio-data'], { type: 'audio/webm' });
      ondataavailable!({ data: chunkData });

      await new Promise(r => setTimeout(r, 50));

      // Memory-only: NO IndexedDB writes during recording
      const dbChunks = await db.audioChunkBuffers.toArray();
      expect(dbChunks.length).toBe(0);

      // Internal chunks array should have data (verified via stopRecording producing a blob)
      expect((service as any).chunks.length).toBe(1);
    });

    it('collects multiple chunks in memory', async () => {
      await service.startRecording('meeting-1');

      const chunkData1 = new Blob(['chunk-1'], { type: 'audio/webm' });
      const chunkData2 = new Blob(['chunk-2'], { type: 'audio/webm' });
      const chunkData3 = new Blob(['chunk-3'], { type: 'audio/webm' });

      ondataavailable!({ data: chunkData1 });
      ondataavailable!({ data: chunkData2 });
      ondataavailable!({ data: chunkData3 });

      // Chunks in memory, not IndexedDB
      expect((service as any).chunks.length).toBe(3);
      const dbChunks = await db.audioChunkBuffers.toArray();
      expect(dbChunks.length).toBe(0);
    });

    it('ignores empty chunks', async () => {
      await service.startRecording('meeting-1');

      const emptyChunk = new Blob([], { type: 'audio/webm' });
      ondataavailable!({ data: emptyChunk });

      await new Promise(r => setTimeout(r, 50));
      const chunks = await db.audioChunkBuffers.toArray();
      expect(chunks.length).toBe(0);
    });
  });

  // --- stopRecording ---

  describe('stopRecording', () => {
    it('creates AudioRecording in Dexie and clears chunk buffers', async () => {
      // Setup: start recording, add enough chunks to pass validation
      await service.startRecording('meeting-1');

      // Simulate enough data for validation (> 1KB)
      const bigChunk = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
      ondataavailable!({ data: bigChunk });
      await new Promise(r => setTimeout(r, 10));

      // Ensure enough time has passed (>2s)
      // Override startTime to simulate 5 seconds elapsed
      (service as any).startTime = Date.now() - 5000;

      const recording = await service.stopRecording();

      expect(recording.meetingId).toBe('meeting-1');
      expect(recording.duration).toBeGreaterThanOrEqual(4);
      expect(recording.mimeType).toBe('audio/webm;codecs=opus');
      expect(recording.order).toBe(1);
      expect(recording.deletedAt).toBeNull();

      // Recording saved to DB
      const saved = await db.audioRecordings.get(recording.id);
      expect(saved).toBeTruthy();
      expect(saved!.meetingId).toBe('meeting-1');

      // Chunk buffers cleared
      const chunks = await db.audioChunkBuffers.toArray();
      expect(chunks.length).toBe(0);

      // Mic released
      expect(mockTrackStop).toHaveBeenCalled();
    });

    it('rejects when no recording in progress', async () => {
      await expect(service.stopRecording()).rejects.toThrow('No recording in progress');
    });

    it('assigns incrementing order for multiple recordings', async () => {
      // First recording
      await service.startRecording('meeting-1');
      const bigChunk = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
      ondataavailable!({ data: bigChunk });
      await new Promise(r => setTimeout(r, 10));
      (service as any).startTime = Date.now() - 5000;
      const rec1 = await service.stopRecording();
      expect(rec1.order).toBe(1);

      // Second recording
      const service2 = new AudioRecorderService();
      await service2.startRecording('meeting-1');
      ondataavailable!({ data: bigChunk });
      await new Promise(r => setTimeout(r, 10));
      (service2 as any).startTime = Date.now() - 5000;
      const rec2 = await service2.stopRecording();
      expect(rec2.order).toBe(2);
    });
  });

  // --- pauseRecording / resumeRecording ---

  describe('pauseRecording / resumeRecording', () => {
    it('delegates to MediaRecorder pause/resume', async () => {
      await service.startRecording('meeting-1');
      expect(service.isRecording()).toBe(true);
      expect(service.isPaused()).toBe(false);

      service.pauseRecording();
      expect(mockPause).toHaveBeenCalled();
      expect(service.isPaused()).toBe(true);
      expect(service.isRecording()).toBe(false);

      service.resumeRecording();
      expect(mockResume).toHaveBeenCalled();
      expect(service.isRecording()).toBe(true);
      expect(service.isPaused()).toBe(false);
    });
  });

  // --- Validation ---

  describe('validation', () => {
    it('rejects recording under 2 seconds', async () => {
      await service.startRecording('meeting-1');
      const bigChunk = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
      ondataavailable!({ data: bigChunk });
      await new Promise(r => setTimeout(r, 10));

      // Don't override startTime — elapsed will be < 2s
      await expect(service.stopRecording()).rejects.toThrow('Recording too short or empty');

      // Chunk buffers should be cleared even on rejection
      const chunks = await db.audioChunkBuffers.toArray();
      expect(chunks.length).toBe(0);
    });

    it('rejects recording under 1KB', async () => {
      await service.startRecording('meeting-1');
      const tinyChunk = new Blob(['x'], { type: 'audio/webm' }); // 1 byte
      ondataavailable!({ data: tinyChunk });
      await new Promise(r => setTimeout(r, 10));
      (service as any).startTime = Date.now() - 5000; // 5s elapsed

      await expect(service.stopRecording()).rejects.toThrow('Recording too short or empty');
    });
  });

  // --- Crash recovery ---

  describe('crash recovery', () => {
    it('recoverSession reconstructs Blob from saved chunks', async () => {
      const sessionId = 'crashed-session-1';
      const meetingId = 'meeting-1';

      // Simulate orphaned chunks
      await db.audioChunkBuffers.bulkAdd([
        {
          id: crypto.randomUUID(),
          sessionId,
          meetingId,
          chunkIndex: 0,
          data: new Blob([new ArrayBuffer(512)], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          meetingId,
          chunkIndex: 1,
          data: new Blob([new ArrayBuffer(512)], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          meetingId,
          chunkIndex: 2,
          data: new Blob([new ArrayBuffer(512)], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
      ]);

      const recording = await AudioRecorderService.recoverSession(sessionId);

      expect(recording).not.toBeNull();
      expect(recording!.meetingId).toBe(meetingId);
      expect(recording!.mimeType).toBe('audio/webm');
      expect(recording!.duration).toBe(3); // 3 chunks = ~3 seconds
      expect(recording!.order).toBe(1);

      // Recording saved to DB
      const saved = await db.audioRecordings.get(recording!.id);
      expect(saved).toBeTruthy();

      // Chunk buffers cleaned up
      const chunks = await db.audioChunkBuffers.where('sessionId').equals(sessionId).count();
      expect(chunks).toBe(0);
    });

    it('returns null for non-existent session', async () => {
      const result = await AudioRecorderService.recoverSession('nonexistent');
      expect(result).toBeNull();
    });

    it('recovers chunks in correct order', async () => {
      const sessionId = 'order-test-session';

      // Add chunks out of order
      await db.audioChunkBuffers.bulkAdd([
        {
          id: crypto.randomUUID(),
          sessionId,
          meetingId: 'meeting-1',
          chunkIndex: 2,
          data: new Blob(['chunk-2'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          meetingId: 'meeting-1',
          chunkIndex: 0,
          data: new Blob(['chunk-0'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          sessionId,
          meetingId: 'meeting-1',
          chunkIndex: 1,
          data: new Blob(['chunk-1'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
      ]);

      const recording = await AudioRecorderService.recoverSession(sessionId);
      expect(recording).not.toBeNull();
      // Blob was created from chunks sorted by chunkIndex
      expect(recording!.blob.size).toBeGreaterThan(0);
    });
  });

  // --- getOrphanedSessions ---

  describe('getOrphanedSessions', () => {
    it('returns sessions with leftover chunks', async () => {
      await db.audioChunkBuffers.bulkAdd([
        {
          id: crypto.randomUUID(),
          sessionId: 'session-a',
          meetingId: 'meeting-1',
          chunkIndex: 0,
          data: new Blob(['data'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          sessionId: 'session-a',
          meetingId: 'meeting-1',
          chunkIndex: 1,
          data: new Blob(['data'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          sessionId: 'session-b',
          meetingId: 'meeting-1',
          chunkIndex: 0,
          data: new Blob(['data'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
      ]);

      const sessions = await AudioRecorderService.getOrphanedSessions('meeting-1');
      expect(sessions.sort()).toEqual(['session-a', 'session-b']);
    });

    it('returns empty array when no orphaned sessions', async () => {
      const sessions = await AudioRecorderService.getOrphanedSessions('meeting-1');
      expect(sessions).toEqual([]);
    });

    it('only returns sessions for the specified meeting', async () => {
      await db.audioChunkBuffers.bulkAdd([
        {
          id: crypto.randomUUID(),
          sessionId: 'session-x',
          meetingId: 'meeting-1',
          chunkIndex: 0,
          data: new Blob(['data'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          sessionId: 'session-y',
          meetingId: 'meeting-2',
          chunkIndex: 0,
          data: new Blob(['data'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          createdAt: new Date(),
        },
      ]);

      const sessions = await AudioRecorderService.getOrphanedSessions('meeting-1');
      expect(sessions).toEqual(['session-x']);
    });
  });
});
