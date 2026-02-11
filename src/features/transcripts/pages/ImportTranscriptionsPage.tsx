import { useState, useEffect } from 'react';
import { Download, Loader2, CheckCircle, Clock, ChevronDown } from 'lucide-react';
import { assemblyaiService } from '../../../services/assemblyaiService';
import type { TranscriptListItem } from '../../../services/assemblyaiService';
import { db } from '../../../db/database';
import type { Meeting, Transcript, SpeakerMap } from '../../../db/database';
import { useToast } from '../../../contexts/ToastContext';

export default function ImportTranscriptionsPage() {
  const { addToast } = useToast();
  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  // Load already-imported transcript IDs from Dexie on mount
  useEffect(() => {
    db.transcripts
      .filter((t) => t.deletedAt === null)
      .toArray()
      .then((existing) => {
        const ids = new Set(existing.map((t) => t.assemblyaiTranscriptId));
        setImportedIds(ids);
      });
  }, []);

  // Fetch transcripts from AssemblyAI on mount
  useEffect(() => {
    fetchTranscripts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchTranscripts(beforeId?: string) {
    try {
      if (beforeId) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      await assemblyaiService.initialize();
      const result = await assemblyaiService.listTranscripts('completed', 200, beforeId);

      if (beforeId) {
        setTranscripts((prev) => [...prev, ...result.transcripts]);
      } else {
        setTranscripts(result.transcripts);
      }

      setNextBeforeId(result.page_details.before_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load transcripts';
      setError(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function handleImport(item: TranscriptListItem) {
    setImportingIds((prev) => new Set(prev).add(item.id));

    try {
      await assemblyaiService.initialize();
      const detail = await assemblyaiService.getTranscriptDetail(item.id);

      const now = new Date();
      const meetingId = crypto.randomUUID();
      const transcriptDate = new Date(detail.created);

      // Create Meeting
      const meeting: Meeting = {
        id: meetingId,
        title: `Imported - ${transcriptDate.toLocaleDateString()}`,
        date: transcriptDate,
        participants: [],
        tags: ['imported'],
        stakeholderIds: [],
        status: 'completed',
        notes: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      // Build speaker map
      const utterances = detail.utterances || [];
      const speakers = [...new Set(utterances.map((u) => u.speaker))].sort();
      const speakerMap: SpeakerMap = {};
      speakers.forEach((s) => { speakerMap[s] = ''; });

      // Create Transcript
      const transcript: Transcript = {
        id: crypto.randomUUID(),
        meetingId,
        audioRecordingId: 'imported',
        assemblyaiTranscriptId: detail.id,
        utterances: utterances.map((u) => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start,
          end: u.end,
          confidence: u.confidence,
        })),
        fullText: detail.text || '',
        speakerMap,
        audioDuration: detail.audio_duration,
        overallConfidence: detail.confidence,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      await db.meetings.add(meeting);
      await db.transcripts.add(transcript);

      // Queue sync for both
      await db.syncQueue.bulkAdd([
        {
          id: crypto.randomUUID(),
          entity: 'meeting',
          entityId: meeting.id,
          operation: 'create',
          payload: JSON.stringify(meeting),
          createdAt: now,
          syncedAt: null,
          error: null,
        },
        {
          id: crypto.randomUUID(),
          entity: 'transcript',
          entityId: transcript.id,
          operation: 'create',
          payload: JSON.stringify(transcript),
          createdAt: now,
          syncedAt: null,
          error: null,
        },
      ]);

      setImportedIds((prev) => new Set(prev).add(item.id));
      addToast('Transcript imported as new meeting', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      addToast(message, 'error');
    } finally {
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  function getPreview(text: string | null): string {
    if (!text) return 'No text available';
    return text.length > 120 ? text.slice(0, 120) + '...' : text;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Import Transcriptions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Import completed transcripts from AssemblyAI as new meetings.
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="ml-2 text-gray-500">Loading transcripts...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => fetchTranscripts()}
            className="mt-2 rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && transcripts.length === 0 && (
        <div className="animate-fade-in rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-600">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-purple-100 dark:from-brand-900/30 dark:to-purple-900/30">
            <Download size={28} className="text-brand-500 dark:text-brand-400" />
          </div>
          <p className="font-medium text-gray-600 dark:text-gray-300">
            No completed transcripts found
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Record on your phone first, then come back here to import.
          </p>
        </div>
      )}

      {/* Transcript list */}
      {!loading && transcripts.length > 0 && (
        <div className="space-y-3">
          {transcripts.map((item) => {
            const isImported = importedIds.has(item.id);
            const isImporting = importingIds.has(item.id);

            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                      <Clock size={12} />
                      <span>{formatDate(item.created)}</span>
                      <span>|</span>
                      <span>{formatDuration(item.audio_duration)}</span>
                      <span className="font-mono text-[10px] text-gray-300 dark:text-gray-600">
                        {item.id}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {getPreview(item.text)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {isImported ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle size={12} />
                        Imported
                      </span>
                    ) : isImporting ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        <Loader2 size={12} className="animate-spin" />
                        Importing...
                      </span>
                    ) : (
                      <button
                        onClick={() => handleImport(item)}
                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        <Download size={12} />
                        Import
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load More */}
          {nextBeforeId && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => fetchTranscripts(nextBeforeId)}
                disabled={loadingMore}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
