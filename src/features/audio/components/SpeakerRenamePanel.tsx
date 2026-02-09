import { useState } from 'react';
import { Users } from 'lucide-react';
import { db } from '../../../db/database';
import type { SpeakerMap } from '../../../db/database';

interface SpeakerRenamePanelProps {
  transcriptId: string;
  speakers: string[];
  speakerMap: SpeakerMap;
  onSpeakerMapChange: (map: SpeakerMap) => void;
}

export default function SpeakerRenamePanel({
  transcriptId,
  speakers,
  speakerMap,
  onSpeakerMapChange,
}: SpeakerRenamePanelProps) {
  const [localMap, setLocalMap] = useState<SpeakerMap>({ ...speakerMap });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await db.transcripts.update(transcriptId, {
        speakerMap: localMap,
        updatedAt: new Date(),
      });
      onSpeakerMapChange(localMap);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(speaker: string, name: string) {
    setLocalMap((prev) => ({ ...prev, [speaker]: name }));
  }

  const hasChanges = JSON.stringify(localMap) !== JSON.stringify(speakerMap);

  if (speakers.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="mb-3 flex items-center gap-2">
        <Users size={16} className="text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Rename Speakers
        </h4>
      </div>
      <div className="space-y-2">
        {speakers.map((speaker) => (
          <div key={speaker} className="flex items-center gap-3">
            <span className="w-24 text-xs font-medium text-gray-500 dark:text-gray-400">
              Speaker {speaker}
            </span>
            <span className="text-gray-400">&rarr;</span>
            <input
              type="text"
              value={localMap[speaker] || ''}
              onChange={(e) => handleChange(speaker, e.target.value)}
              placeholder={`Enter name for Speaker ${speaker}`}
              aria-label={`Rename Speaker ${speaker}`}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={!hasChanges || saving}
        className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Names'}
      </button>
    </div>
  );
}
