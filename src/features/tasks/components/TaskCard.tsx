import { Link } from 'react-router-dom';
import { Trash2, RotateCcw, User, Bell, ExternalLink, CloudUpload, CheckCircle } from 'lucide-react';
import type { Task } from '../../../db/database';

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

interface TaskCardProps {
  task: Task;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  deleteIcon?: 'delete' | 'unarchive';
}

function isSyncedToTaskFlow(task: Task): boolean {
  return (
    task.taskFlowSyncedAt !== null &&
    task.taskFlowSyncedAt !== undefined &&
    task.updatedAt <= task.taskFlowSyncedAt
  );
}

export default function TaskCard({ task, onToggleStatus, onDelete, deleteIcon = 'delete' }: TaskCardProps) {
  const isDone = task.status === 'done';
  const synced = isSyncedToTaskFlow(task);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
      {/* Checkbox */}
      <button
        onClick={() => onToggleStatus(task.id)}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
          isDone
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-gray-300 hover:border-brand-500 dark:border-gray-600'
        }`}
        aria-label={isDone ? 'Mark as todo' : 'Mark as done'}
      >
        {isDone && (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
            {task.title}
          </p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {/* Type badge */}
          {task.type === 'task' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              <User size={10} />
              My Task
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <Bell size={10} />
              Follow-up
            </span>
          )}

          {/* Priority badge */}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
            {task.priority}
          </span>

          {/* Deadline */}
          {task.deadline && task.deadline !== 'TBD' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Due: {task.deadline}
            </span>
          )}

          {/* Owner */}
          {task.owner && task.owner !== 'TBD' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Owner: {task.owner}
            </span>
          )}

          {/* Sync status */}
          {synced ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400" title="Synced to TaskFlow">
              <CheckCircle size={10} />
              Synced
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" title="Pending push to TaskFlow">
              <CloudUpload size={10} />
              Pending
            </span>
          )}
        </div>

        {/* Follow-up target */}
        {task.type === 'followup' && task.followUpTarget && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Follow up with: {task.followUpTarget}
          </p>
        )}

        {/* Source meeting link */}
        {task.sourceMeetingTitle && (
          <Link
            to={`/meetings/${task.meetingId}`}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-500 dark:text-gray-500 dark:hover:text-brand-400"
          >
            <ExternalLink size={10} />
            {task.sourceMeetingTitle}
          </Link>
        )}
      </div>

      {/* Delete / Unarchive button */}
      <button
        onClick={() => onDelete(task.id)}
        className={`shrink-0 rounded-lg p-1.5 transition-colors ${
          deleteIcon === 'unarchive'
            ? 'text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-900/20 dark:hover:text-brand-400'
            : 'text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400'
        }`}
        aria-label={deleteIcon === 'unarchive' ? 'Unarchive task' : 'Delete task'}
      >
        {deleteIcon === 'unarchive' ? <RotateCcw size={14} /> : <Trash2 size={14} />}
      </button>
    </div>
  );
}
