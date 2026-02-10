import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Pause, Play, Square, Wifi, WifiOff } from 'lucide-react';
import { audioRecorderService } from '../../../services/audioRecorderService';
import { wakeLockService } from '../../../services/wakeLockService';
import { useOnline } from '../../../contexts/OnlineContext';
import { useToast } from '../../../contexts/ToastContext';

interface AudioRecorderProps {
  meetingId: string;
  onRecordingComplete: (recordingId: string) => void;
}

type RecordingState = 'idle' | 'recording' | 'paused';

export default function AudioRecorder({ meetingId, onRecordingComplete }: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOnline = useOnline();
  const { addToast } = useToast();

  // Timer management
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - audioRecorderService.getStartTime()) / 1000));
    }, 200);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  // beforeunload warning when recording is active
  useEffect(() => {
    if (state === 'idle') return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state]);

  async function handleStart() {
    try {
      await wakeLockService.acquire();
      await audioRecorderService.startRecording(meetingId);
      setState('recording');
      setElapsed(0);
      startTimer();
    } catch (err) {
      await wakeLockService.release();
      addToast(
        err instanceof Error ? err.message : 'Failed to start recording',
        'error',
      );
    }
  }

  function handlePause() {
    audioRecorderService.pauseRecording();
    setState('paused');
    stopTimer();
  }

  function handleResume() {
    audioRecorderService.resumeRecording();
    setState('recording');
    startTimer();
  }

  async function handleStop() {
    stopTimer();
    try {
      const recording = await audioRecorderService.stopRecording();
      addToast('Recording saved', 'success');
      onRecordingComplete(recording.id);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Recording failed',
        'error',
      );
    } finally {
      await wakeLockService.release();
      setState('idle');
      setElapsed(0);
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {state === 'idle' && (
            <button
              onClick={handleStart}
              className="audio-record-btn flex items-center gap-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
              aria-label="Start recording"
            >
              <Mic size={16} />
              Record
            </button>
          )}

          {state === 'recording' && (
            <>
              <button
                onClick={handlePause}
                className="audio-record-btn flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
                aria-label="Pause recording"
              >
                <Pause size={16} />
                Pause
              </button>
              <button
                onClick={handleStop}
                className="audio-record-btn flex items-center gap-2 rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
                aria-label="Stop recording"
              >
                <Square size={16} />
                Stop
              </button>
            </>
          )}

          {state === 'paused' && (
            <>
              <button
                onClick={handleResume}
                className="audio-record-btn flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
                aria-label="Resume recording"
              >
                <Play size={16} />
                Resume
              </button>
              <button
                onClick={handleStop}
                className="audio-record-btn flex items-center gap-2 rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
                aria-label="Stop recording"
              >
                <Square size={16} />
                Stop
              </button>
            </>
          )}

          {state !== 'idle' && (
            <div className="flex items-center gap-2">
              {state === 'recording' && (
                <span className="relative flex h-2.5 w-2.5" aria-label="Recording indicator">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
              )}
              {state === 'paused' && (
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-label="Paused indicator" />
              )}
              <span className="font-mono text-lg text-gray-700 dark:text-gray-300" data-testid="recording-timer">
                {formatTime(elapsed)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm" aria-label={isOnline ? 'Online' : 'Offline'}>
          {isOnline ? (
            <>
              <Wifi size={14} className="text-green-500" />
              <span className="text-green-600 dark:text-green-400">Online</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-amber-500" />
              <span className="text-amber-600 dark:text-amber-400">Offline</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
