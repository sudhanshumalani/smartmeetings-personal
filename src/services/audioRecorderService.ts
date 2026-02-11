import { db } from '../db/database';
import type { AudioRecording } from '../db/database';

/**
 * AudioRecorderService
 *
 * Key design decisions for reliable iOS operation (learned from old MeetingFlow app):
 * 1. ondataavailable: Memory-only chunk collection — no IndexedDB writes during recording
 * 2. stopRecording: Three fallback triggers (onstop + ondataavailable-inactive + timeout)
 *    with dedup flag so processing runs exactly once
 * 3. onstop handler: Full try/catch — errors reject the Promise instead of hanging forever
 * 4. IndexedDB persist: Non-fatal — recording object returned even if DB write fails
 * 5. Tracks released immediately after stop() (matching old app pattern)
 */
export class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private sessionId: string = '';
  private meetingId: string = '';
  private startTime: number = 0;

  getSupportedMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
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
    this.meetingId = meetingId;
    this.sessionId = crypto.randomUUID();
    this.startTime = Date.now();

    // Collect chunks in memory only — no IndexedDB during recording.
    // Old MeetingFlow app proved this is more reliable on iOS than writing
    // to IndexedDB every second (avoids async timing issues + storage pressure).
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000);
  }

  stopRecording(): Promise<AudioRecording> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      // Capture state before async processing
      const mimeType = this.mediaRecorder.mimeType || this.getSupportedMimeType();
      const meetingId = this.meetingId;
      const startTime = this.startTime;

      // Dedup flag — processRecording must run exactly once across all triggers
      let settled = false;

      const processRecording = async () => {
        if (settled) return;
        settled = true;

        try {
          const blob = new Blob(this.chunks, { type: mimeType });
          const duration = Math.round((Date.now() - startTime) / 1000);

          if (duration < 2 || blob.size < 1024) {
            this.mediaRecorder = null;
            reject(new Error('Recording too short or empty'));
            return;
          }

          // Determine order (non-fatal if DB query fails)
          let order = 1;
          try {
            const count = await db.audioRecordings
              .where('meetingId').equals(meetingId)
              .filter(r => r.deletedAt === null)
              .count();
            order = count + 1;
          } catch { /* default order 1 */ }

          const recording: AudioRecording = {
            id: crypto.randomUUID(),
            meetingId,
            blob,
            mimeType,
            duration,
            order,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };

          // Non-fatal IndexedDB persist — recording returned even if this fails.
          // On desktop, useLiveQuery needs this in DB. On mobile, only the blob matters for upload.
          try {
            await db.audioRecordings.add(recording);
          } catch (err) {
            console.warn('Failed to persist recording to IndexedDB (non-fatal):', err);
          }

          this.mediaRecorder = null;
          resolve(recording);
        } catch (err) {
          this.mediaRecorder = null;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      // ── Trigger 1: onstop (normal path) ──
      // Registered BEFORE calling stop() — iOS Safari may fire onstop synchronously
      this.mediaRecorder.onstop = () => {
        processRecording();
      };

      // ── Trigger 2: ondataavailable fallback (iOS Safari) ──
      // iOS Safari sometimes doesn't fire onstop but does fire ondataavailable
      // with the recorder in 'inactive' state
      const origOnData = this.mediaRecorder.ondataavailable;
      this.mediaRecorder.ondataavailable = (event) => {
        // Call original handler to collect the final chunk
        if (origOnData) origOnData.call(this.mediaRecorder!, event);
        // If recorder became inactive but onstop never fired
        if (this.mediaRecorder?.state === 'inactive' && !settled) {
          processRecording();
        }
      };

      // ── Trigger 3: Timeout fallback (3s) ──
      // If neither onstop nor ondataavailable triggered processing
      setTimeout(() => {
        if (!settled) {
          if (this.chunks.length > 0) {
            processRecording();
          } else {
            settled = true;
            this.mediaRecorder?.stream?.getTracks().forEach(t => t.stop());
            this.mediaRecorder = null;
            reject(new Error('Recording produced no audio data'));
          }
        }
      }, 3000);

      // Stop recorder — triggers final ondataavailable then onstop
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }

      // Release microphone immediately (matches old MeetingFlow app pattern).
      // Data has already been buffered; stopping tracks just removes the mic indicator.
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
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

  getSessionId(): string {
    return this.sessionId;
  }

  getStartTime(): number {
    return this.startTime;
  }

  /** Recover audio from chunk buffers after a crash */
  static async recoverSession(sessionId: string): Promise<AudioRecording | null> {
    const chunks = await db.audioChunkBuffers
      .where('sessionId').equals(sessionId)
      .sortBy('chunkIndex');

    if (chunks.length === 0) return null;

    const blob = new Blob(
      chunks.map(c => c.data),
      { type: chunks[0].mimeType },
    );

    const meetingId = chunks[0].meetingId;
    const mimeType = chunks[0].mimeType;
    const duration = Math.round(chunks.length); // ~1 chunk per second

    const existingCount = await db.audioRecordings
      .where('meetingId').equals(meetingId)
      .filter(r => r.deletedAt === null)
      .count();

    const recording: AudioRecording = {
      id: crypto.randomUUID(),
      meetingId,
      blob,
      mimeType,
      duration,
      order: existingCount + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    await db.audioRecordings.add(recording);
    await db.audioChunkBuffers.where('sessionId').equals(sessionId).delete();

    return recording;
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
