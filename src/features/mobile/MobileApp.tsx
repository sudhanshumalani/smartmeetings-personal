import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Pause, Play, Square, Settings, CheckCircle, AlertCircle, Loader2, Copy, Check, Download, RefreshCw, WifiOff } from 'lucide-react';
import { audioRecorderService } from '../../services/audioRecorderService';
import { assemblyaiService } from '../../services/assemblyaiService';
import { wakeLockService } from '../../services/wakeLockService';
import { getAssemblyAiApiKey, saveAssemblyAiApiKey } from '../../services/settingsService';

type MobileState = 'setup' | 'idle' | 'recording' | 'paused' | 'finalizing' | 'uploading' | 'done' | 'error';

const MAX_UPLOAD_RETRIES = 3;

export default function MobileApp() {
  const [state, setState] = useState<MobileState>('idle');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDetail, setUploadDetail] = useState('');
  const [transcriptId, setTranscriptId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tempMeetingId = useRef(crypto.randomUUID());
  const audioBlobRef = useRef<Blob | null>(null);

  // Check for API key on mount and when settings overlay toggles
  useEffect(() => {
    getAssemblyAiApiKey().then((key) => {
      setHasApiKey(!!key);
      if (!key) setState('setup');
    });
  }, [showSettings]);

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

  // Re-acquire wake lock on visibility change (iOS releases it when backgrounded)
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && (state === 'recording' || state === 'uploading')) {
        await wakeLockService.acquire();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [state]);

  async function handleSaveApiKey() {
    const key = apiKeyInput.trim();
    if (!key) return;
    try {
      await saveAssemblyAiApiKey(key);
      // Pre-validate the key by initializing the service
      await assemblyaiService.initialize();
      setApiKeyInput('');
      setHasApiKey(true);
      setState('idle');
      setShowSettings(false);
    } catch {
      setErrorMessage('Invalid API key or network error. Please check and try again.');
      setState('error');
      setShowSettings(false);
    }
  }

  async function handleStartRecording() {
    try {
      tempMeetingId.current = crypto.randomUUID();
      audioBlobRef.current = null;
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
    setState('finalizing');

    try {
      const recording = await audioRecorderService.stopRecording();
      // Store blob in ref for retry / save-to-device
      audioBlobRef.current = recording.blob;
      // Immediately start upload
      await uploadToAssemblyAI(recording.blob);
    } catch (err) {
      await wakeLockService.release();
      setErrorMessage(err instanceof Error ? err.message : 'Recording failed');
      setState('error');
    }
  }

  async function uploadToAssemblyAI(blob: Blob, attempt = 1) {
    // Connectivity check
    if (!navigator.onLine) {
      throw new Error('No internet connection. Check your network and retry.');
    }

    setState('uploading');
    setUploadProgress(0);
    setUploadDetail(attempt > 1 ? `Retry ${attempt - 1}/${MAX_UPLOAD_RETRIES}...` : 'Uploading audio...');

    // Initialize AssemblyAI (loads API key)
    try {
      await assemblyaiService.initialize();
    } catch {
      throw new Error('AssemblyAI API key is invalid or missing. Check Settings.');
    }

    await wakeLockService.acquire();

    try {
      const uploadUrl = await assemblyaiService.uploadAudio(blob, (percent) => {
        setUploadProgress(percent);
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        setUploadDetail(`Uploading: ${Math.round(percent)}% of ${sizeMB} MB`);
      });

      setUploadDetail('Creating transcription job...');
      const id = await assemblyaiService.requestTranscription(uploadUrl);
      setTranscriptId(id);

      await wakeLockService.release();
      setState('done');
    } catch (err) {
      // Retry if attempts remain
      if (attempt < MAX_UPLOAD_RETRIES) {
        setUploadDetail(`Upload failed, retrying in 2s (${attempt}/${MAX_UPLOAD_RETRIES})...`);
        await new Promise(r => setTimeout(r, 2000));
        return uploadToAssemblyAI(blob, attempt + 1);
      }
      // All retries exhausted
      await wakeLockService.release();
      throw err;
    }
  }

  function handleRecordAnother() {
    setTranscriptId('');
    setUploadProgress(0);
    setUploadDetail('');
    setErrorMessage('');
    setCopied(false);
    audioBlobRef.current = null;
    setState('idle');
  }

  async function handleRetry() {
    // If we have a stored blob, retry upload instead of starting over
    if (audioBlobRef.current) {
      setErrorMessage('');
      try {
        await uploadToAssemblyAI(audioBlobRef.current);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
        setState('error');
      }
    } else {
      setErrorMessage('');
      setState('idle');
    }
  }

  function handleDownloadAudio() {
    if (!audioBlobRef.current) return;
    try {
      const url = URL.createObjectURL(audioBlobRef.current);
      const a = document.createElement('a');
      const ext = audioBlobRef.current.type.includes('mp4') ? '.mp4' : '.webm';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `recording-${timestamp}${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback — not critical
    }
  }

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(transcriptId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: user can long-press the text
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Settings overlay
  if (state === 'setup' || showSettings) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-gradient-to-br from-brand-50 via-white to-purple-50 px-4 pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] dark:from-gray-900 dark:via-gray-900 dark:to-brand-900/20">
        <div className="w-full max-w-sm animate-fade-in space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 shadow-lg">
              <Settings size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">
              SmartMeetings
            </h1>
          </div>

          {/* Show current key status */}
          {hasApiKey && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                API key is configured
              </span>
            </div>
          )}

          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            {hasApiKey
              ? 'Enter a new key below to replace the existing one, or cancel.'
              : 'Enter your AssemblyAI API key to enable recording and transcription.'}
          </p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AssemblyAI API Key"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition-shadow focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            autoFocus
          />
          <button
            onClick={handleSaveApiKey}
            disabled={!apiKeyInput.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            Save & Continue
          </button>
          {showSettings && (
            <button
              onClick={() => setShowSettings(false)}
              className="w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-gradient-to-br from-brand-50 via-white to-purple-50 px-4 pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] dark:from-gray-900 dark:via-gray-900 dark:to-brand-900/20">
      {/* Settings gear — positioned within safe area */}
      <button
        onClick={() => setShowSettings(true)}
        className="absolute right-4 rounded-xl p-2.5 text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
        aria-label="Settings"
      >
        <Settings size={20} />
      </button>

      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 shadow-md">
        <Mic size={20} className="text-white" />
      </div>
      <h1 className="mb-1 text-xl font-bold gradient-text">
        SmartMeetings
      </h1>
      <p className="mb-10 text-xs font-medium text-gray-400 dark:text-gray-500">Mobile Recorder</p>

      {/* Idle state */}
      {state === 'idle' && (
        <div className="animate-fade-in flex flex-col items-center gap-6">
          <div className="relative">
            <button
              onClick={handleStartRecording}
              className="relative z-10 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-xl shadow-red-500/30 transition-transform active:scale-95"
              aria-label="Start recording"
            >
              <Mic size={48} className="text-white" />
            </button>
          </div>
          <p className="text-sm text-gray-400">Tap to start recording</p>
        </div>
      )}

      {/* Recording state */}
      {state === 'recording' && (
        <div className="animate-fade-in flex flex-col items-center gap-6">
          <div className="relative flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <span className="font-mono text-4xl font-light tracking-wider text-gray-800 dark:text-gray-100">
              {formatTime(elapsed)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handlePause}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 shadow-lg shadow-amber-500/25 transition-transform active:scale-95"
              aria-label="Pause"
            >
              <Pause size={24} className="text-white" />
            </button>
            <button
              onClick={handleStop}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg transition-transform active:scale-95"
              aria-label="Stop"
            >
              <Square size={28} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Paused state */}
      {state === 'paused' && (
        <div className="animate-fade-in flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-amber-500" />
            <span className="font-mono text-4xl font-light tracking-wider text-gray-800 dark:text-gray-100">
              {formatTime(elapsed)}
            </span>
          </div>
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Paused</p>
          <div className="flex items-center gap-4">
            <button
              onClick={handleResume}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/25 transition-transform active:scale-95"
              aria-label="Resume"
            >
              <Play size={24} className="text-white" />
            </button>
            <button
              onClick={handleStop}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg transition-transform active:scale-95"
              aria-label="Stop"
            >
              <Square size={28} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Finalizing state */}
      {state === 'finalizing' && (
        <div className="animate-fade-in flex w-full max-w-xs flex-col items-center gap-4">
          <Loader2 size={36} className="animate-spin text-brand-500" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Finalizing recording...
          </p>
          <p className="text-xs text-gray-400">Please wait, preparing audio file</p>
        </div>
      )}

      {/* Uploading state */}
      {state === 'uploading' && (
        <div className="animate-fade-in flex w-full max-w-xs flex-col items-center gap-4">
          <Loader2 size={36} className="animate-spin text-brand-500" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Uploading to AssemblyAI...
          </p>
          <div className="w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{uploadProgress}%</span>
          {uploadDetail && (
            <p className="text-xs text-gray-400">{uploadDetail}</p>
          )}
          <p className="text-xs text-gray-400">Keep this screen open until upload completes.</p>
        </div>
      )}

      {/* Done state */}
      {state === 'done' && (
        <div className="animate-fade-in flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/20">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Upload Complete
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Transcription is processing. Import it on desktop when ready.
          </p>
          <div className="w-full rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-1 text-xs font-medium text-gray-400">Transcript ID</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                {transcriptId}
              </code>
              <button
                onClick={handleCopyId}
                className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                aria-label="Copy transcript ID"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <button
            onClick={handleRecordAnother}
            className="mt-2 w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
          >
            Record Another
          </button>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="animate-fade-in flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <div className="mb-2 flex justify-center">
              {!navigator.onLine
                ? <WifiOff size={32} className="text-red-500" />
                : <AlertCircle size={32} className="text-red-500" />
              }
            </div>
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          </div>

          <div className="flex w-full flex-col gap-2">
            <button
              onClick={handleRetry}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
            >
              <RefreshCw size={14} />
              {audioBlobRef.current ? 'Retry Upload' : 'Try Again'}
            </button>

            {/* Save to Device — fallback when upload fails but we have the blob */}
            {audioBlobRef.current && (
              <button
                onClick={handleDownloadAudio}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Download size={14} className="shrink-0" />
                <span className="truncate">Save Audio to Device ({(audioBlobRef.current.size / 1024 / 1024).toFixed(1)} MB)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
