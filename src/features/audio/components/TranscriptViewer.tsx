import type { TranscriptUtterance, SpeakerMap } from '../../../db/database';

interface TranscriptViewerProps {
  utterances: TranscriptUtterance[];
  speakerMap: SpeakerMap;
  overallConfidence: number;
}

const SPEAKER_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  B: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  C: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  D: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  E: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  F: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
};

const DEFAULT_COLOR = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

function getSpeakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker] || DEFAULT_COLOR;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function TranscriptViewer({
  utterances,
  speakerMap,
  overallConfidence,
}: TranscriptViewerProps) {
  if (utterances.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-gray-400 dark:border-gray-600">
        No transcript available.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="mb-3 flex items-center justify-between text-xs text-gray-400">
        <span>{utterances.length} utterances</span>
        <span title="Overall transcription confidence">
          Confidence: {Math.round(overallConfidence * 100)}%
        </span>
      </div>

      <div className="space-y-2">
        {utterances.map((utterance, index) => {
          const displayName = speakerMap[utterance.speaker] || `Speaker ${utterance.speaker}`;
          const colorClass = getSpeakerColor(utterance.speaker);

          return (
            <div key={index} className="group flex gap-3" data-testid={`utterance-${index}`}>
              <div className="flex w-20 shrink-0 flex-col items-end pt-1">
                <span className="text-xs text-gray-400">
                  {formatTimestamp(utterance.start)}
                </span>
              </div>
              <div className="flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
                  >
                    {displayName}
                  </span>
                  <span
                    className="text-[10px] text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600"
                    title={`Confidence: ${Math.round(utterance.confidence * 100)}%`}
                  >
                    {Math.round(utterance.confidence * 100)}%
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {utterance.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
