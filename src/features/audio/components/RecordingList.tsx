import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Mic, FileText, RotateCcw, Loader2, Monitor } from 'lucide-react';
import { db } from '../../../db/database';
import type { Transcript, SpeakerMap } from '../../../db/database';
import { useToast } from '../../../contexts/ToastContext';
import { useOnline } from '../../../contexts/OnlineContext';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import { assemblyaiService } from '../../../services/assemblyaiService';
import type { TranscriptionStatus } from '../../../services/assemblyaiService';
import { wakeLockService } from '../../../services/wakeLockService';
import TranscriptViewer from './TranscriptViewer';
import SpeakerRenamePanel from './SpeakerRenamePanel';

interface RecordingListProps {
  meetingId: string;
  autoTranscribeId?: string | null;
  onAutoTranscribeStarted?: () => void;
}

export default function RecordingList({ meetingId, autoTranscribeId, onAutoTranscribeStarted }: RecordingListProps) {
  const { addToast } = useToast();

  const recordings = useLiveQuery(
    () => db.audioRecordings
      .where('meetingId').equals(meetingId)
      .filter(r => r.deletedAt === null)
      .sortBy('order'),
    [meetingId],
  );

  async function handleDelete(id: string) {
    await db.audioRecordings.update(id, {
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
    addToast('Recording deleted', 'info');
  }

  if (!recordings || recordings.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400 dark:border-gray-600">
        <Mic size={24} className="mx-auto mb-2 opacity-50" />
        <p>No recordings yet. Click Record to start.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Recordings ({recordings.length})
      </h3>
      {recordings.map((recording) => (
        <RecordingItem
          key={recording.id}
          id={recording.id}
          meetingId={meetingId}
          blobUrl={recording.blob}
          mimeType={recording.mimeType}
          duration={recording.duration}
          order={recording.order}
          createdAt={recording.createdAt}
          onDelete={handleDelete}
          autoTranscribe={recording.id === autoTranscribeId}
          onAutoTranscribeStarted={onAutoTranscribeStarted}
        />
      ))}
    </div>
  );
}

interface RecordingItemProps {
  id: string;
  meetingId: string;
  blobUrl: Blob;
  mimeType: string;
  duration: number;
  order: number;
  createdAt: Date;
  onDelete: (id: string) => void;
  autoTranscribe?: boolean;
  onAutoTranscribeStarted?: () => void;
}

function RecordingItem({ id, meetingId, blobUrl, duration, order, createdAt, onDelete, autoTranscribe, onAutoTranscribeStarted }: RecordingItemProps) {
  const audioSrc = useMemo(() => URL.createObjectURL(blobUrl), [blobUrl]);
  const { isOnline } = useOnline();
  const { addToast } = useToast();
  const isMobile = useIsMobile();

  // Transcription state
  const [transcribing, setTranscribing] = useState(false);
  const [status, setStatus] = useState<TranscriptionStatus | null>(null);
  const [statusDetail, setStatusDetail] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Transcript display state
  const [showTranscript, setShowTranscript] = useState(false);

  // Load existing transcript for this recording
  const transcript = useLiveQuery(
    () => db.transcripts
      .where('audioRecordingId').equals(id)
      .filter(t => t.deletedAt === null)
      .first(),
    [id],
  );

  // Speaker map state (local, synced from transcript)
  const [speakerMap, setSpeakerMap] = useState<SpeakerMap>({});
  useEffect(() => {
    if (transcript) {
      setSpeakerMap(transcript.speakerMap);
    }
  }, [transcript]);

  const startElapsedTimer = useCallback(() => {
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopElapsedTimer();
  }, [stopElapsedTimer]);

  // Auto-transcribe when recording just completed (PRD 9.1: "If online → start transcription")
  const autoTranscribeTriggered = useRef(false);
  useEffect(() => {
    if (autoTranscribe && isOnline && !isMobile && !transcript && !transcribing && !autoTranscribeTriggered.current) {
      autoTranscribeTriggered.current = true;
      onAutoTranscribeStarted?.();
      // Small delay to let the UI settle after recording stop
      const timer = setTimeout(() => {
        handleTranscribe();
      }, 500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranscribe, isOnline, isMobile, transcript, transcribing]);

  async function handleTranscribe() {
    setTranscribing(true);
    setError(null);
    setUploadProgress(0);
    startElapsedTimer();

    try {
      await assemblyaiService.initialize();
      await wakeLockService.acquire();

      const result = await assemblyaiService.transcribe(blobUrl, {
        onStatusChange: (s: TranscriptionStatus, detail?: string) => {
          setStatus(s);
          setStatusDetail(detail || '');
        },
        onUploadProgress: (percent: number) => {
          setUploadProgress(percent);
        },
      });

      // Extract unique speakers
      const speakers = [...new Set(result.utterances.map((u) => u.speaker))].sort();
      const initialSpeakerMap: SpeakerMap = {};
      speakers.forEach((s) => { initialSpeakerMap[s] = ''; });

      // Save transcript to Dexie
      const transcriptRecord: Transcript = {
        id: crypto.randomUUID(),
        meetingId,
        audioRecordingId: id,
        assemblyaiTranscriptId: result.transcriptId,
        utterances: result.utterances.map((u) => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start,
          end: u.end,
          confidence: u.confidence,
        })),
        fullText: result.text,
        speakerMap: initialSpeakerMap,
        audioDuration: result.audioDuration,
        overallConfidence: result.confidence,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      await db.transcripts.add(transcriptRecord);

      // Queue sync
      await db.syncQueue.add({
        id: crypto.randomUUID(),
        entity: 'transcript',
        entityId: transcriptRecord.id,
        operation: 'create',
        payload: JSON.stringify(transcriptRecord),
        createdAt: new Date(),
        syncedAt: null,
        error: null,
      });

      addToast('Transcription complete!', 'success');
      setShowTranscript(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      setError(message);
      setStatus('error');
      addToast(message, 'error');
    } finally {
      stopElapsedTimer();
      setTranscribing(false);
      await wakeLockService.release();
    }
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  const hasTranscript = !!transcript;
  const speakers = transcript
    ? [...new Set(transcript.utterances.map((u) => u.speaker))].sort()
    : [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Recording {order}
            </span>
            <span className="text-xs text-gray-400">
              {formatDuration(duration)}
            </span>
            <span className="text-xs text-gray-400">
              {createdAt.toLocaleTimeString()}
            </span>
            {hasTranscript && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <FileText size={10} />
                Transcribed
              </span>
            )}
          </div>
          <audio controls src={audioSrc} className="w-full" preload="metadata">
            <track kind="captions" />
            Your browser does not support the audio element.
          </audio>
        </div>
        <div className="flex flex-col gap-1">
          {!hasTranscript && !transcribing && !isMobile && (
            <button
              onClick={handleTranscribe}
              disabled={!isOnline}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={!isOnline ? 'Transcription requires internet' : 'Transcribe this recording'}
            >
              Transcribe
            </button>
          )}
          {!hasTranscript && !transcribing && isMobile && (
            <p className="flex items-center gap-1 text-[10px] text-gray-400">
              <Monitor size={10} />
              Open on desktop to transcribe
            </p>
          )}
          {hasTranscript && !showTranscript && !isMobile && (
            <button
              onClick={() => setShowTranscript(true)}
              className="rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              View Transcript
            </button>
          )}
          {hasTranscript && showTranscript && !isMobile && (
            <button
              onClick={() => setShowTranscript(false)}
              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Hide Transcript
            </button>
          )}
          <button
            onClick={() => onDelete(id)}
            disabled={transcribing}
            className="flex items-center gap-1 rounded px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            aria-label={`Delete recording ${order}`}
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      </div>

      {/* Transcription progress */}
      {transcribing && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20" data-testid="transcription-progress">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {statusDetail || 'Starting...'}
              </span>
            </div>
            <span className="font-mono text-xs text-blue-500" data-testid="transcription-timer">
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>

          {/* Upload progress bar */}
          {status === 'uploading' && (
            <div className="h-2 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
              />
            </div>
          )}

          {/* Status steps */}
          <div className="mt-2 flex items-center gap-4 text-xs text-blue-500">
            <StepIndicator
              label="Upload"
              active={status === 'uploading'}
              done={status === 'processing' || status === 'completed'}
            />
            <StepIndicator
              label="Transcribe"
              active={status === 'processing'}
              done={status === 'completed'}
            />
            <StepIndicator
              label="Complete"
              active={false}
              done={status === 'completed'}
            />
          </div>
        </div>
      )}

      {/* Error with retry */}
      {error && !transcribing && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20" data-testid="transcription-error">
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
          <button
            onClick={handleTranscribe}
            disabled={!isOnline}
            className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <RotateCcw size={12} />
            Retry
          </button>
        </div>
      )}

      {/* Transcript viewer (desktop only) */}
      {!isMobile && hasTranscript && showTranscript && transcript && (
        <div className="mt-3 space-y-3">
          <SpeakerRenamePanel
            transcriptId={transcript.id}
            speakers={speakers}
            speakerMap={speakerMap}
            onSpeakerMapChange={setSpeakerMap}
          />
          <TranscriptViewer
            utterances={transcript.utterances}
            speakerMap={speakerMap}
            overallConfidence={transcript.overallConfidence}
          />
        </div>
      )}
    </div>
  );
}

function StepIndicator({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`${done ? 'font-semibold text-green-600 dark:text-green-400' : active ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-gray-400'}`}
      data-testid={`step-${label.toLowerCase()}`}
    >
      {done ? '\u2713' : active ? '\u25CF' : '\u25CB'} {label}
    </span>
  );
}
