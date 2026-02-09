import { getAssemblyAiApiKey } from './settingsService';

// --- Types ---

export interface AssemblyAIUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: { text: string; start: number; end: number; confidence: number; speaker: string }[];
}

export interface TranscriptionResult {
  transcriptId: string;
  text: string;
  utterances: AssemblyAIUtterance[];
  audioDuration: number;
  confidence: number;
  speakersDetected: number;
}

export type TranscriptionStatus = 'uploading' | 'processing' | 'completed' | 'error';

export interface ProgressCallback {
  onStatusChange: (status: TranscriptionStatus, detail?: string) => void;
  onUploadProgress: (percent: number) => void;
}

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';
const MAX_POLL_ATTEMPTS = 180; // 3 minutes at 1-second intervals

// --- Service ---

export class AssemblyAIService {
  private apiKey: string = '';

  /** Load the API key from encrypted Dexie storage. Must be called before transcribe(). */
  async initialize(): Promise<void> {
    const key = await getAssemblyAiApiKey();
    if (!key) {
      throw new Error('AssemblyAI API key not configured. Set it in Settings.');
    }
    this.apiKey = key;
  }

  /** Full pipeline: upload → request transcription → poll → return result */
  async transcribe(audioBlob: Blob, callbacks: ProgressCallback): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key not initialized. Call initialize() first.');
    }

    // Step 1: Upload audio with progress tracking
    callbacks.onStatusChange('uploading', 'Uploading audio...');
    const uploadUrl = await this.uploadAudio(audioBlob, callbacks.onUploadProgress);

    // Step 2: Request transcription with speaker diarization
    callbacks.onStatusChange('processing', 'Transcribing with speaker detection...');
    const transcriptId = await this.requestTranscription(uploadUrl);

    // Step 3: Poll for result
    const result = await this.pollForResult(transcriptId, callbacks);

    return result;
  }

  private async uploadAudio(blob: Blob, onProgress: (percent: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${ASSEMBLYAI_BASE}/upload`);
      xhr.setRequestHeader('authorization', this.apiKey);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const { upload_url } = JSON.parse(xhr.responseText);
            resolve(upload_url);
          } catch {
            reject(new Error('Invalid upload response'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(blob);
    });
  }

  private async requestTranscription(audioUrl: string): Promise<string> {
    const response = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: 'POST',
      headers: {
        'authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        language_code: 'en',
      }),
    });

    if (!response.ok) {
      throw new Error(`Transcription request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.id;
  }

  private async pollForResult(
    transcriptId: string,
    callbacks: ProgressCallback,
  ): Promise<TranscriptionResult> {
    let attempts = 0;

    while (attempts < MAX_POLL_ATTEMPTS) {
      const response = await fetch(
        `${ASSEMBLYAI_BASE}/transcript/${transcriptId}`,
        { headers: { 'authorization': this.apiKey } },
      );

      if (!response.ok) {
        throw new Error(`Poll request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'completed') {
        callbacks.onStatusChange('completed', 'Transcription complete!');

        const speakersDetected = new Set(
          (data.utterances || []).map((u: AssemblyAIUtterance) => u.speaker),
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

      // Still queued or processing
      callbacks.onStatusChange('processing', `Transcribing... (${attempts}s elapsed)`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error('Transcription timed out after 3 minutes');
  }
}

export const assemblyaiService = new AssemblyAIService();
