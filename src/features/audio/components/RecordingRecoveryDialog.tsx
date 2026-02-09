import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AudioRecorderService } from '../../../services/audioRecorderService';
import { db } from '../../../db/database';
import { useToast } from '../../../contexts/ToastContext';

interface RecordingRecoveryDialogProps {
  sessionIds: string[];
  onDismiss: () => void;
}

export default function RecordingRecoveryDialog({ sessionIds, onDismiss }: RecordingRecoveryDialogProps) {
  const [recovering, setRecovering] = useState(false);
  const { addToast } = useToast();

  async function handleRecover() {
    setRecovering(true);
    try {
      let recovered = 0;
      for (const sessionId of sessionIds) {
        const result = await AudioRecorderService.recoverSession(sessionId);
        if (result) recovered++;
      }
      addToast(
        `Recovered ${recovered} recording${recovered !== 1 ? 's' : ''}`,
        'success',
      );
    } catch {
      addToast('Failed to recover recordings', 'error');
    }
    setRecovering(false);
    onDismiss();
  }

  async function handleDiscard() {
    for (const sessionId of sessionIds) {
      await db.audioChunkBuffers.where('sessionId').equals(sessionId).delete();
    }
    addToast('Interrupted recordings discarded', 'info');
    onDismiss();
  }

  return (
    <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/20">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
            Interrupted Recording Found
          </h3>
          <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
            We found {sessionIds.length} interrupted recording{sessionIds.length !== 1 ? 's' : ''}.
            Would you like to recover {sessionIds.length !== 1 ? 'them' : 'it'}?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleRecover}
              disabled={recovering}
              className="rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              {recovering ? 'Recovering...' : 'Recover'}
            </button>
            <button
              onClick={handleDiscard}
              disabled={recovering}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
