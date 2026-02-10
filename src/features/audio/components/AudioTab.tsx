import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AudioRecorderService } from '../../../services/audioRecorderService';
import { db } from '../../../db/database';
import type { SpeakerMap } from '../../../db/database';
import AudioRecorder from './AudioRecorder';
import RecordingList from './RecordingList';
import RecordingRecoveryDialog from './RecordingRecoveryDialog';
import TranscriptViewer from './TranscriptViewer';
import SpeakerRenamePanel from './SpeakerRenamePanel';

interface AudioTabProps {
  meetingId: string;
}

export default function AudioTab({ meetingId }: AudioTabProps) {
  const [orphanedSessions, setOrphanedSessions] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoTranscribeId, setAutoTranscribeId] = useState<string | null>(null);

  useEffect(() => {
    AudioRecorderService.getOrphanedSessions(meetingId).then(sessions => {
      setOrphanedSessions(sessions);
    });
  }, [meetingId]);

  const handleRecordingComplete = useCallback((recordingId: string) => {
    setRefreshKey(k => k + 1);
    setAutoTranscribeId(recordingId);
  }, []);

  function handleRecoveryDismiss() {
    setOrphanedSessions([]);
    setRefreshKey(k => k + 1);
  }

  // Query for imported transcripts (audioRecordingId === 'imported')
  const importedTranscript = useLiveQuery(
    () => db.transcripts
      .where('meetingId').equals(meetingId)
      .filter(t => t.deletedAt === null && t.audioRecordingId === 'imported')
      .first(),
    [meetingId],
  );

  const [importedSpeakerMap, setImportedSpeakerMap] = useState<SpeakerMap>({});

  useEffect(() => {
    if (importedTranscript) {
      setImportedSpeakerMap(importedTranscript.speakerMap);
    }
  }, [importedTranscript]);

  const importedSpeakers = importedTranscript
    ? [...new Set(importedTranscript.utterances.map(u => u.speaker))].sort()
    : [];

  return (
    <div>
      {orphanedSessions.length > 0 && (
        <RecordingRecoveryDialog
          sessionIds={orphanedSessions}
          onDismiss={handleRecoveryDismiss}
        />
      )}

      {/* Imported transcript display (no recorder or recording list for imported meetings) */}
      {importedTranscript ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            This transcript was imported from AssemblyAI. No local audio recording exists.
          </div>
          <SpeakerRenamePanel
            transcriptId={importedTranscript.id}
            speakers={importedSpeakers}
            speakerMap={importedSpeakerMap}
            onSpeakerMapChange={setImportedSpeakerMap}
          />
          <TranscriptViewer
            utterances={importedTranscript.utterances}
            speakerMap={importedSpeakerMap}
            overallConfidence={importedTranscript.overallConfidence}
          />
        </div>
      ) : (
        <>
          <AudioRecorder
            meetingId={meetingId}
            onRecordingComplete={handleRecordingComplete}
          />
          <RecordingList
            key={refreshKey}
            meetingId={meetingId}
            autoTranscribeId={autoTranscribeId}
            onAutoTranscribeStarted={() => setAutoTranscribeId(null)}
          />
        </>
      )}
    </div>
  );
}
