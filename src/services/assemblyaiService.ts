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

export interface TranscriptListItem {
  id: string;
  status: string;
  audio_url: string;
  text: string | null;
  created: string;
  audio_duration: number | null;
}

export interface TranscriptListResponse {
  page_details: {
    limit: number;
    result_count: number;
    current_url: string;
    prev_url: string | null;
    next_url: string | null;
    before_id: string | null;
    after_id: string | null;
  };
  transcripts: TranscriptListItem[];
}

export interface TranscriptDetail {
  id: string;
  status: string;
  text: string;
  utterances: AssemblyAIUtterance[] | null;
  audio_duration: number;
  confidence: number;
  created: string;
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

  async uploadAudio(blob: Blob, onProgress: (percent: number) => void): Promise<string> {
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

  async requestTranscription(audioUrl: string): Promise<string> {
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

  /** List transcripts from AssemblyAI. Optionally filter by status and paginate. */
  async listTranscripts(
    status?: string,
    limit: number = 20,
    beforeId?: string,
  ): Promise<TranscriptListResponse> {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key not initialized. Call initialize() first.');
    }

    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    if (beforeId) params.set('before_id', beforeId);

    const response = await fetch(
      `${ASSEMBLYAI_BASE}/transcript?${params.toString()}`,
      { headers: { 'authorization': this.apiKey } },
    );

    if (!response.ok) {
      throw new Error(`List transcripts failed: ${response.status}`);
    }

    return response.json();
  }

  /** Fetch full transcript detail including utterances. */
  async getTranscriptDetail(id: string): Promise<TranscriptDetail> {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key not initialized. Call initialize() first.');
    }

    const response = await fetch(
      `${ASSEMBLYAI_BASE}/transcript/${id}`,
      { headers: { 'authorization': this.apiKey } },
    );

    if (!response.ok) {
      throw new Error(`Get transcript detail failed: ${response.status}`);
    }

    return response.json();
  }
}

export const assemblyaiService = new AssemblyAIService();
