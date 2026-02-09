import { useState, useEffect, useCallback } from 'react';
import { AudioRecorderService } from '../../../services/audioRecorderService';
import AudioRecorder from './AudioRecorder';
import RecordingList from './RecordingList';
import RecordingRecoveryDialog from './RecordingRecoveryDialog';

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

  return (
    <div>
      {orphanedSessions.length > 0 && (
        <RecordingRecoveryDialog
          sessionIds={orphanedSessions}
          onDismiss={handleRecoveryDismiss}
        />
      )}
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
    </div>
  );
}
