import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  ListPlus,
} from 'lucide-react';
import type { MeetingAnalysis } from '../../../db/database';
import { taskRepository } from '../../../services/taskRepository';
import { useToast } from '../../../contexts/ToastContext';
import ActionItemTriage from './ActionItemTriage';

interface AnalysisPanelProps {
  analysis: MeetingAnalysis;
  meetingId?: string;
  meetingTitle?: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const TYPE_CONFIG: Record<string, { icon: typeof AlertTriangle; style: string }> = {
  question: {
    icon: HelpCircle,
    style: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  blocker: {
    icon: ShieldAlert,
    style: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  risk: {
    icon: AlertTriangle,
    style: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
};

export default function AnalysisPanel({ analysis, meetingId, meetingTitle }: AnalysisPanelProps) {
  const { addToast } = useToast();
  const addedIndices = useLiveQuery(
    () => taskRepository.getAddedActionItemIndices(analysis.id),
    [analysis.id],
  );

  async function handleAddTask(
    index: number,
    type: 'task' | 'followup',
    edits: { title: string; followUpTarget: string; deadline: string; priority: 'high' | 'medium' | 'low' },
  ) {
    await taskRepository.create({
      meetingId: meetingId || analysis.meetingId,
      analysisId: analysis.id,
      type,
      title: edits.title,
      description: analysis.actionItems[index]?.context || '',
      owner: analysis.actionItems[index]?.owner || '',
      deadline: edits.deadline,
      priority: edits.priority,
      followUpTarget: type === 'followup' ? edits.followUpTarget : '',
      sourceMeetingTitle: meetingTitle || '',
      sourceActionItemIndex: index,
    });
    addToast(`Added as ${type === 'task' ? 'My Task' : 'Follow-up'}`, 'success');
  }

  async function handleAddAllAsTasks() {
    const indices = addedIndices ?? new Set<number>();
    const inputs = analysis.actionItems
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => !indices.has(i))
      .map(({ item, i }) => ({
        meetingId: meetingId || analysis.meetingId,
        analysisId: analysis.id,
        type: 'task' as const,
        title: item.task,
        description: item.context || '',
        owner: item.owner,
        deadline: item.deadline,
        priority: item.priority,
        followUpTarget: '',
        sourceMeetingTitle: meetingTitle || '',
        sourceActionItemIndex: i,
      }));
    if (inputs.length === 0) {
      addToast('All action items already added', 'info');
      return;
    }
    await taskRepository.createMany(inputs);
    addToast(`Added ${inputs.length} task${inputs.length !== 1 ? 's' : ''}`, 'success');
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Summary
        </h3>
        <p className="rounded-lg bg-blue-50 p-4 text-sm leading-relaxed text-gray-700 dark:bg-blue-900/20 dark:text-gray-300">
          {analysis.summary}
        </p>
      </section>

      {/* Themes */}
      {analysis.themes.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Themes ({analysis.themes.length})
          </h3>
          <div className="space-y-2">
            {analysis.themes.map((theme, i) => (
              <ThemeCard key={i} topic={theme.topic} keyPoints={theme.keyPoints} context={theme.context} />
            ))}
          </div>
        </section>
      )}

      {/* Decisions */}
      {analysis.decisions.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Decisions ({analysis.decisions.length})
          </h3>
          <div className="space-y-2">
            {analysis.decisions.map((d, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="mb-1 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {d.decision}
                  </span>
                </div>
                <div className="ml-5 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                  <p><strong>Made by:</strong> {d.madeBy}</p>
                  <p><strong>Rationale:</strong> {d.rationale}</p>
                  <p><strong>Implications:</strong> {d.implications}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action Items with Triage */}
      {analysis.actionItems.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Action Items ({analysis.actionItems.length})
            </h3>
            {meetingId && (
              <button
                onClick={handleAddAllAsTasks}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50"
              >
                <ListPlus size={12} />
                Add All as My Tasks
              </button>
            )}
          </div>
          <div className="space-y-2">
            {analysis.actionItems.map((item, i) => (
              meetingId ? (
                <ActionItemTriage
                  key={i}
                  item={item}
                  index={i}
                  isAdded={addedIndices?.has(i) ?? false}
                  onAdd={handleAddTask}
                />
              ) : (
                <div
                  key={i}
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {item.task}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span><strong>Owner:</strong> {item.owner}</span>
                        <span><strong>Deadline:</strong> {item.deadline}</span>
                      </div>
                      {item.context && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{item.context}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium}`}
                    >
                      {item.priority}
                    </span>
                  </div>
                </div>
              )
            ))}
          </div>
        </section>
      )}

      {/* Open Items */}
      {analysis.openItems.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Open Items ({analysis.openItems.length})
          </h3>
          <div className="space-y-2">
            {analysis.openItems.map((item, i) => {
              const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.question;
              const Icon = typeConf.icon;
              return (
                <div
                  key={i}
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${typeConf.style}`}
                    >
                      <Icon size={10} />
                      {item.type}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200">{item.item}</p>
                      <div className="mt-1 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span><strong>Owner:</strong> {item.owner}</span>
                        <span><strong>Urgency:</strong> {item.urgency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Next Steps */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Next Steps
        </h3>
        <p className="rounded-lg bg-green-50 p-4 text-sm leading-relaxed text-gray-700 dark:bg-green-900/20 dark:text-gray-300">
          {analysis.nextSteps}
        </p>
      </section>

      {/* Source info */}
      <div className="text-xs text-gray-400 dark:text-gray-500">
        Analyzed {analysis.createdAt.toLocaleString()} via {analysis.sourceType === 'api' ? 'Claude API' : 'manual copy-paste'}
      </div>
    </div>
  );
}

function ThemeCard({
  topic,
  keyPoints,
  context,
}: {
  topic: string;
  keyPoints: string[];
  context: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 p-3 text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-gray-400" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-gray-400" />
        )}
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{topic}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 dark:border-gray-700">
          <ul className="mb-2 space-y-1">
            {keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="mt-1 shrink-0 text-gray-300">&bull;</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          {context && (
            <p className="text-xs italic text-gray-400 dark:text-gray-500">
              Context: {context}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
