import { useState } from 'react';
import { User, Bell, CheckCircle2 } from 'lucide-react';
import type { ActionItem } from '../../../db/database';

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

interface ActionItemTriageProps {
  item: ActionItem;
  index: number;
  isAdded: boolean;
  onAdd: (index: number, type: 'task' | 'followup', edits: {
    title: string;
    followUpTarget: string;
    deadline: string;
    priority: 'high' | 'medium' | 'low';
  }) => void;
}

export default function ActionItemTriage({ item, index, isAdded, onAdd }: ActionItemTriageProps) {
  const [expandedType, setExpandedType] = useState<'task' | 'followup' | null>(null);
  const [title, setTitle] = useState(item.task);
  const [followUpTarget, setFollowUpTarget] = useState(item.owner);
  const [deadline, setDeadline] = useState(item.deadline);
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>(item.priority);

  function handleExpand(type: 'task' | 'followup') {
    if (expandedType === type) {
      setExpandedType(null);
    } else {
      setExpandedType(type);
      setTitle(item.task);
      setFollowUpTarget(item.owner);
      setDeadline(item.deadline);
      setPriority(item.priority);
    }
  }

  function handleSubmit() {
    if (!expandedType) return;
    onAdd(index, expandedType, { title, followUpTarget, deadline, priority });
    setExpandedType(null);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="p-3">
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

        {/* Triage buttons or Added badge */}
        <div className="mt-2 flex items-center gap-2">
          {isAdded ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 size={12} />
              Added
            </span>
          ) : (
            <>
              <button
                onClick={() => handleExpand('task')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  expandedType === 'task'
                    ? 'bg-brand-600 text-white'
                    : 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50'
                }`}
              >
                <User size={12} />
                My Task
              </button>
              <button
                onClick={() => handleExpand('followup')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  expandedType === 'followup'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50'
                }`}
              >
                <Bell size={12} />
                Follow-up
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {expandedType && !isAdded && (
        <div className="border-t border-gray-100 p-3 dark:border-gray-700">
          <div className="space-y-2">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
              />
            </div>
            {expandedType === 'followup' && (
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Follow up with</label>
                <input
                  type="text"
                  value={followUpTarget}
                  onChange={(e) => setFollowUpTarget(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                />
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Deadline</label>
                <input
                  type="text"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                />
              </div>
              <div className="w-28">
                <label className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSubmit}
                disabled={!title.trim()}
                className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => setExpandedType(null)}
                className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
