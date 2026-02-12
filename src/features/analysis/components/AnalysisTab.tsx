import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Brain, Loader2, Settings, AlertCircle } from 'lucide-react';
import { db } from '../../../db/database';
import type { MeetingAnalysis } from '../../../db/database';
import { useOnline } from '../../../contexts/OnlineContext';
import { useToast } from '../../../contexts/ToastContext';
import { claudeService, prepareAnalysisText } from '../../../services/claudeService';
import type { AnalysisResult } from '../../../services/claudeService';
import { getClaudeApiKey } from '../../../services/settingsService';
import { promptTemplateRepository } from '../../../services/promptTemplateRepository';
import AnalysisPanel from './AnalysisPanel';
import CopyPasteModal from './CopyPasteModal';

interface AnalysisTabProps {
  meetingId: string;
  notesPlainText: string;
  meetingTitle: string;
}

export default function AnalysisTab({ meetingId, notesPlainText, meetingTitle }: AnalysisTabProps) {
  const { isOnline } = useOnline();
  const { addToast } = useToast();

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [preparedText, setPreparedText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [showCopyPaste, setShowCopyPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');

  // Load prompt templates
  const promptTemplates = useLiveQuery(() => promptTemplateRepository.getAll());

  // Set default selection once templates are loaded
  useEffect(() => {
    if (promptTemplates && !selectedPromptId) {
      const defaultTemplate = promptTemplates.find(t => t.isDefault);
      if (defaultTemplate) setSelectedPromptId(defaultTemplate.id);
      else if (promptTemplates.length > 0) setSelectedPromptId(promptTemplates[0].id);
    }
  }, [promptTemplates, selectedPromptId]);

  const selectedPromptContent = promptTemplates?.find(t => t.id === selectedPromptId)?.content;

  // Load existing analysis (latest non-deleted)
  const existingAnalysis = useLiveQuery(
    () => db.meetingAnalyses
      .where('meetingId')
      .equals(meetingId)
      .filter((a) => a.deletedAt === null)
      .sortBy('createdAt')
      .then((results) => results[results.length - 1] || null),
    [meetingId],
  );

  // Check for API key on mount
  useEffect(() => {
    getClaudeApiKey().then((key) => setHasApiKey(!!key));
  }, []);

  // Prepare text on mount and when dependencies change
  const loadPreparedText = useCallback(async () => {
    const text = await prepareAnalysisText(meetingId, notesPlainText);
    setPreparedText(text);
  }, [meetingId, notesPlainText]);

  useEffect(() => {
    loadPreparedText();
  }, [loadPreparedText]);

  async function handleAnalyze() {
    if (!preparedText.trim()) {
      addToast('No content to analyze. Add notes or transcribe audio first.', 'warning');
      return;
    }

    setError(null);
    setAnalyzing(true);

    try {
      await claudeService.initialize();
      const result = await claudeService.analyze(preparedText, selectedPromptContent);
      await saveAnalysis(result, 'api', selectedPromptId || undefined);
      addToast('Analysis complete!', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);

      // If API call fails, offer copy-paste fallback
      if (message.includes('API key not configured') || !isOnline) {
        setShowCopyPaste(true);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  function handleManualAnalysis() {
    if (!preparedText.trim()) {
      addToast('No content to analyze. Add notes or transcribe audio first.', 'warning');
      return;
    }
    setShowCopyPaste(true);
  }

  async function handleCopyPasteResult(result: AnalysisResult) {
    await saveAnalysis(result, 'manual', selectedPromptId || undefined);
    setShowCopyPaste(false);
    addToast('Analysis saved!', 'success');
  }

  async function saveAnalysis(result: AnalysisResult, sourceType: 'api' | 'manual', promptTemplateId?: string) {
    // Soft-delete existing analysis
    const existing = await db.meetingAnalyses
      .where('meetingId')
      .equals(meetingId)
      .filter((a) => a.deletedAt === null)
      .toArray();

    for (const old of existing) {
      await db.meetingAnalyses.update(old.id, { deletedAt: new Date() });
    }

    // Create new analysis (cast API string types to database union types)
    const analysis: MeetingAnalysis = {
      id: crypto.randomUUID(),
      meetingId,
      summary: result.summary,
      themes: result.themes,
      decisions: result.decisions,
      actionItems: result.actionItems.map((item) => ({
        ...item,
        priority: item.priority as 'high' | 'medium' | 'low',
      })),
      openItems: result.openItems.map((item) => ({
        ...item,
        type: item.type as 'question' | 'blocker' | 'risk',
      })),
      nextSteps: result.nextSteps,
      sourceType,
      inputText: preparedText,
      promptTemplateId,
      createdAt: new Date(),
      deletedAt: null,
    };

    await db.meetingAnalyses.add(analysis);

    // Queue sync
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      entity: 'meetingAnalysis',
      entityId: analysis.id,
      operation: 'create',
      payload: JSON.stringify(analysis),
      createdAt: new Date(),
      syncedAt: null,
      error: null,
    });
  }

  const hasExistingAnalysis = !!existingAnalysis;
  const hasContent = preparedText.trim().length > 0;

  // Loading state for API key check
  if (hasApiKey === null) {
    return <div className="py-8 text-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* API key warning */}
      {!hasApiKey && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <Settings size={18} className="shrink-0 text-yellow-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
              Claude API key not configured
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-500">
              <Link to="/settings" className="underline hover:no-underline">
                Set your Claude API key in Settings
              </Link>{' '}
              for automatic analysis, or use the manual copy-paste workflow below.
            </p>
          </div>
        </div>
      )}

      {/* Text preparation area */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">
          Text to Analyze
        </label>
        <textarea
          value={preparedText}
          onChange={(e) => setPreparedText(e.target.value)}
          placeholder="No content yet. Add notes or transcribe audio to generate analysis input."
          rows={8}
          className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-700 placeholder-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
        />
        <p className="mt-1 text-xs text-gray-400">
          You can edit this text before running analysis.
        </p>
      </div>

      {/* Prompt template selector */}
      {promptTemplates && promptTemplates.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Analysis Prompt
          </label>
          <select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 sm:w-auto"
          >
            {promptTemplates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        {hasApiKey && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !hasContent || !isOnline}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={!isOnline ? 'Analysis requires internet' : !hasContent ? 'No content to analyze' : undefined}
          >
            {analyzing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Brain size={16} />
            )}
            <span aria-live="polite">
              {analyzing ? 'Analyzing...' : hasExistingAnalysis ? 'Re-analyze' : 'Analyze'}
            </span>
          </button>
        )}

        <button
          onClick={handleManualAnalysis}
          disabled={!hasContent}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Copy-Paste Workflow
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20" data-testid="analysis-error">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <div>
            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            {!hasApiKey && (
              <p className="mt-1 text-xs text-red-500">
                Try the Copy-Paste Workflow instead.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Existing analysis display */}
      {hasExistingAnalysis && existingAnalysis && (
        <AnalysisPanel analysis={existingAnalysis} meetingId={meetingId} meetingTitle={meetingTitle} />
      )}

      {/* Empty state */}
      {!hasExistingAnalysis && !analyzing && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-400 dark:border-gray-600">
          <Brain size={32} className="mx-auto mb-2 opacity-50" />
          <p>No analysis yet. Click "{hasApiKey ? 'Analyze' : 'Copy-Paste Workflow'}" to get started.</p>
        </div>
      )}

      {/* Copy-paste modal */}
      {showCopyPaste && (
        <CopyPasteModal
          prompt={claudeService.buildPromptForCopyPaste(preparedText, selectedPromptContent)}
          onResult={handleCopyPasteResult}
          onClose={() => setShowCopyPaste(false)}
        />
      )}
    </div>
  );
}
