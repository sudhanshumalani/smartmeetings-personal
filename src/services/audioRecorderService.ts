import { db } from '../db/database';
import type { AudioRecording } from '../db/database';

export class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private sessionId: string = '';
  private chunkIndex: number = 0;
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
    this.chunkIndex = 0;
    this.meetingId = meetingId;
    this.sessionId = crypto.randomUUID();
    this.startTime = Date.now();

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

  async stopRecording(): Promise<AudioRecording> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder!.mimeType;
        const blob = new Blob(this.chunks, { type: mimeType });
        const duration = (Date.now() - this.startTime) / 1000;

        // Validate: minimum 2 seconds and 1KB
        if (duration < 2 || blob.size < 1024) {
          // Clean up mic
          this.mediaRecorder!.stream.getTracks().forEach(track => track.stop());
          // Clear chunk buffers even on reject
          await db.audioChunkBuffers.where('sessionId').equals(this.sessionId).delete();
          this.mediaRecorder = null;
          reject(new Error('Recording too short or empty'));
          return;
        }

        // Release microphone
        this.mediaRecorder!.stream.getTracks().forEach(track => track.stop());

        // Determine order for this meeting
        const existingCount = await db.audioRecordings
          .where('meetingId').equals(this.meetingId)
          .filter(r => r.deletedAt === null)
          .count();

        const recording: AudioRecording = {
          id: crypto.randomUUID(),
          meetingId: this.meetingId,
          blob,
          mimeType,
          duration: Math.round(duration),
          order: existingCount + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };

        // Save to Dexie
        await db.audioRecordings.add(recording);

        // Clear chunk buffer for this session (recording saved successfully)
        await db.audioChunkBuffers.where('sessionId').equals(this.sessionId).delete();

        this.mediaRecorder = null;
        resolve(recording);
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
