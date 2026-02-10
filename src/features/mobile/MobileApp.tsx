import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Pause, Play, Square, Settings, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { audioRecorderService } from '../../services/audioRecorderService';
import { assemblyaiService } from '../../services/assemblyaiService';
import { wakeLockService } from '../../services/wakeLockService';
import { getAssemblyAiApiKey, saveAssemblyAiApiKey } from '../../services/settingsService';

type MobileState = 'setup' | 'idle' | 'recording' | 'paused' | 'uploading' | 'done' | 'error';

export default function MobileApp() {
  const [state, setState] = useState<MobileState>('idle');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcriptId, setTranscriptId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tempMeetingId = useRef(crypto.randomUUID());

  // Check for API key on mount
  useEffect(() => {
    getAssemblyAiApiKey().then((key) => {
      if (!key) setState('setup');
    });
  }, []);

  const startTimer = useCallback(() => {
    setElapsed(0);
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

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  async function handleSaveApiKey() {
    const key = apiKeyInput.trim();
    if (!key) return;
    await saveAssemblyAiApiKey(key);
    setApiKeyInput('');
    setState('idle');
    setShowSettings(false);
  }

  async function handleStartRecording() {
    try {
      tempMeetingId.current = crypto.randomUUID();
      await wakeLockService.acquire();
      await audioRecorderService.startRecording(tempMeetingId.current);
      setState('recording');
      startTimer();
    } catch (err) {
      await wakeLockService.release();
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start recording');
      setState('error');
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
    setState('uploading');
    setUploadProgress(0);

    try {
      const recording = await audioRecorderService.stopRecording();

      // Upload to AssemblyAI
      await assemblyaiService.initialize();
      await wakeLockService.acquire();

      const uploadUrl = await assemblyaiService.uploadAudio(recording.blob, (percent) => {
        setUploadProgress(percent);
      });

      const id = await assemblyaiService.requestTranscription(uploadUrl);
      setTranscriptId(id);

      await wakeLockService.release();
      setState('done');
    } catch (err) {
      await wakeLockService.release();
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
      setState('error');
    }
  }

  function handleRecordAnother() {
    setTranscriptId('');
    setUploadProgress(0);
    setErrorMessage('');
    setState('idle');
  }

  function handleRetry() {
    setErrorMessage('');
    setState('idle');
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Settings overlay
  if (state === 'setup' || showSettings) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 dark:bg-gray-900">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-center text-2xl font-bold text-gray-800 dark:text-gray-100">
            SmartMeetings
          </h1>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Enter your AssemblyAI API key to enable recording and transcription.
          </p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AssemblyAI API Key"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            autoFocus
          />
          <button
            onClick={handleSaveApiKey}
            disabled={!apiKeyInput.trim()}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save & Continue
          </button>
          {showSettings && (
            <button
              onClick={() => setShowSettings(false)}
              className="w-full rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-600 dark:border-gray-600 dark:text-gray-400"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 dark:bg-gray-900">
      {/* Settings gear */}
      <button
        onClick={() => setShowSettings(true)}
        className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
        aria-label="Settings"
      >
        <Settings size={20} />
      </button>

      <h1 className="mb-2 text-xl font-bold text-gray-800 dark:text-gray-100">
        SmartMeetings
      </h1>
      <p className="mb-8 text-xs text-gray-400">Mobile Recorder</p>

      {/* Idle state */}
      {state === 'idle' && (
        <button
          onClick={handleStartRecording}
          className="flex h-32 w-32 items-center justify-center rounded-full bg-red-600 shadow-lg active:bg-red-700"
          aria-label="Start recording"
        >
          <Mic size={48} className="text-white" />
        </button>
      )}

      {/* Recording state */}
      {state === 'recording' && (
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-4xl text-gray-800 dark:text-gray-100">
              {formatTime(elapsed)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handlePause}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500 shadow active:bg-yellow-600"
              aria-label="Pause"
            >
              <Pause size={28} className="text-white" />
            </button>
            <button
              onClick={handleStop}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 shadow active:bg-gray-800"
              aria-label="Stop"
            >
              <Square size={32} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Paused state */}
      {state === 'paused' && (
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-yellow-500" />
            <span className="font-mono text-4xl text-gray-800 dark:text-gray-100">
              {formatTime(elapsed)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleResume}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 shadow active:bg-green-700"
              aria-label="Resume"
            >
              <Play size={28} className="text-white" />
            </button>
            <button
              onClick={handleStop}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 shadow active:bg-gray-800"
              aria-label="Stop"
            >
              <Square size={32} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Uploading state */}
      {state === 'uploading' && (
        <div className="flex w-full max-w-xs flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-blue-600" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Uploading to AssemblyAI...
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">{uploadProgress}%</span>
          <p className="text-xs text-gray-400">Keep this screen open until upload completes.</p>
        </div>
      )}

      {/* Done state */}
      {state === 'done' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle size={48} className="text-green-500" />
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Upload Complete
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Transcription is processing. You can close the app.
          </p>
          <p className="rounded bg-gray-100 px-3 py-1 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            ID: {transcriptId}
          </p>
          <p className="text-xs text-gray-400">
            Import this transcript on desktop via the Import page.
          </p>
          <button
            onClick={handleRecordAnother}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Record Another
          </button>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle size={48} className="text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          <button
            onClick={handleRetry}
            className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
