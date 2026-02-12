import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ListTodo, ClipboardCopy, Send, Loader2 } from 'lucide-react';
import { taskRepository } from '../../../services/taskRepository';
import { useToast } from '../../../contexts/ToastContext';
import { pushConfirmedTasks } from '../../../services/taskFlowService';
import EmptyState from '../../../shared/components/EmptyState';
import TaskCard from '../components/TaskCard';

type TabFilter = 'all' | 'task' | 'followup';
type SortOption = 'deadline' | 'priority' | 'date';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function TasksPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<TabFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [pushing, setPushing] = useState(false);

  const tasks = useLiveQuery(() => taskRepository.getAll());

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let result = tasks;
    if (tab !== 'all') {
      result = result.filter(t => t.type === tab);
    }
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter);
    }
    return result;
  }, [tasks, tab, priorityFilter]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
        case 'deadline':
          // Sort TBD/empty deadlines to end
          if (!a.deadline || a.deadline === 'TBD') return 1;
          if (!b.deadline || b.deadline === 'TBD') return -1;
          return a.deadline.localeCompare(b.deadline);
        case 'date':
        default:
          return b.createdAt.getTime() - a.createdAt.getTime();
      }
    });
  }, [filteredTasks, sortBy]);

  // Split into todo and done
  const todoTasks = sortedTasks.filter(t => t.status === 'todo');
  const doneTasks = sortedTasks.filter(t => t.status === 'done');

  async function handleToggleStatus(id: string) {
    await taskRepository.toggleStatus(id);
  }

  async function handleDelete(id: string) {
    await taskRepository.softDelete(id);
    addToast(
      `Task moved to Trash`,
      'success',
      5000,
      {
        label: 'Undo',
        onClick: async () => {
          await taskRepository.restore(id);
          addToast('Task restored', 'success');
        },
      },
    );
  }

  function handleExport() {
    if (!tasks || tasks.length === 0) {
      addToast('No tasks to export', 'info');
      return;
    }
    const text = sortedTasks
      .map(t => {
        const status = t.status === 'done' ? '[x]' : '[ ]';
        const type = t.type === 'task' ? 'Task' : 'Follow-up';
        const parts = [`${status} ${t.title}`, `(${type}, ${t.priority})`];
        if (t.deadline && t.deadline !== 'TBD') parts.push(`Due: ${t.deadline}`);
        if (t.owner && t.owner !== 'TBD') parts.push(`Owner: ${t.owner}`);
        if (t.type === 'followup' && t.followUpTarget) parts.push(`Follow up with: ${t.followUpTarget}`);
        if (t.sourceMeetingTitle) parts.push(`From: ${t.sourceMeetingTitle}`);
        return parts.join(' | ');
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    addToast('Tasks copied to clipboard', 'success');
  }

  async function handlePushToTaskFlow() {
    if (!tasks || tasks.length === 0) {
      addToast('No tasks to push', 'info');
      return;
    }
    setPushing(true);
    try {
      const result = await pushConfirmedTasks();
      if (result.failed > 0) {
        addToast(`Pushed ${result.pushed} tasks, ${result.failed} failed`, 'error');
      } else {
        addToast(`${result.pushed} tasks pushed to TaskFlow`, 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not configured')) {
        addToast('Cloud sync not configured. Set URL and token in Settings.', 'warning');
      } else {
        addToast(`TaskFlow push failed: ${message}`, 'error');
      }
    } finally {
      setPushing(false);
    }
  }

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: tasks?.length ?? 0 },
    { key: 'task', label: 'My Tasks', count: tasks?.filter(t => t.type === 'task').length ?? 0 },
    { key: 'followup', label: 'Follow-ups', count: tasks?.filter(t => t.type === 'followup').length ?? 0 },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Tasks
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePushToTaskFlow}
            disabled={pushing || !navigator.onLine}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {pushing ? 'Pushing...' : 'Push to TaskFlow'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <ClipboardCopy size={14} />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Sort & Filter controls */}
      <div className="mb-4 flex items-center gap-2">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          aria-label="Sort by"
        >
          <option value="date">Sort: Date Added</option>
          <option value="priority">Sort: Priority</option>
          <option value="deadline">Sort: Deadline</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          aria-label="Filter by priority"
        >
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Task List */}
      {tasks === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="skeleton h-5 w-5 rounded" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedTasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo size={48} />}
          title="No tasks yet"
          description="Open a meeting's Analysis tab and triage action items to add them as tasks."
        />
      ) : (
        <div className="space-y-6">
          {/* Todo tasks */}
          {todoTasks.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                To Do ({todoTasks.length})
              </h2>
              <div className="space-y-2">
                {todoTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggleStatus={handleToggleStatus}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Done tasks */}
          {doneTasks.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Done ({doneTasks.length})
              </h2>
              <div className="space-y-2">
                {doneTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggleStatus={handleToggleStatus}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
