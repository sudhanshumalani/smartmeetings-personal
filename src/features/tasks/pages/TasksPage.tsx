import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ListTodo, ClipboardCopy, Send, Loader2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { db } from '../../../db/database';
import type { Task } from '../../../db/database';
import { taskRepository } from '../../../services/taskRepository';
import { useToast } from '../../../contexts/ToastContext';
import { pushConfirmedTasks, syncStakeholdersToTaskFlow } from '../../../services/taskFlowService';
import EmptyState from '../../../shared/components/EmptyState';
import TaskCard from '../components/TaskCard';

type TabFilter = 'all' | 'task' | 'followup';
type GroupByOption = 'stakeholder' | 'deadline' | 'priority';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

const PRIORITY_LABELS: Record<string, string> = { high: 'High Priority', medium: 'Medium Priority', low: 'Low Priority' };

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDeadlineSectionLabel(deadline: string): string {
  if (!deadline || deadline === 'TBD') return 'No Due Date';

  const date = new Date(deadline);
  if (isNaN(date.getTime())) return 'No Due Date';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (date < today) return 'Overdue';

  const startOfThisWeek = getStartOfWeek(now);
  const endOfThisWeek = new Date(startOfThisWeek);
  endOfThisWeek.setDate(endOfThisWeek.getDate() + 6);
  endOfThisWeek.setHours(23, 59, 59, 999);

  const startOfNextWeek = new Date(endOfThisWeek);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + 1);
  startOfNextWeek.setHours(0, 0, 0, 0);
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);

  if (date >= today && date <= endOfThisWeek) return 'This Week';
  if (date >= startOfNextWeek && date <= endOfNextWeek) return 'Next Week';

  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupTasksByDeadline(tasks: Task[]): [string, Task[]][] {
  const groups = new Map<string, Task[]>();
  const order = ['Overdue', 'This Week', 'Next Week'];

  for (const task of tasks) {
    const label = getDeadlineSectionLabel(task.deadline);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(task);
  }

  // Sort: Overdue first, then This Week, Next Week, then chronological months, No Due Date last
  const entries = [...groups.entries()];
  entries.sort(([a], [b]) => {
    if (a === 'No Due Date') return 1;
    if (b === 'No Due Date') return -1;
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  return entries;
}

function groupTasksByStakeholder(
  tasks: Task[],
  meetingStakeholderMap: Map<string, string[]>,
): [string, Task[]][] {
  const groups = new Map<string, Task[]>();

  for (const task of tasks) {
    const names = meetingStakeholderMap.get(task.meetingId);
    if (names && names.length > 0) {
      // Group under each stakeholder the meeting is tagged with
      for (const name of names) {
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name)!.push(task);
      }
    } else {
      if (!groups.has('No Stakeholder')) groups.set('No Stakeholder', []);
      groups.get('No Stakeholder')!.push(task);
    }
  }

  // Sort alphabetically, No Stakeholder at the end
  const entries = [...groups.entries()];
  entries.sort(([a], [b]) => {
    if (a === 'No Stakeholder') return 1;
    if (b === 'No Stakeholder') return -1;
    return a.localeCompare(b);
  });

  return entries;
}

function groupTasksByPriority(tasks: Task[]): [string, Task[]][] {
  const groups = new Map<string, Task[]>();

  for (const task of tasks) {
    const label = PRIORITY_LABELS[task.priority] || 'Medium Priority';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(task);
  }

  // Fixed order: High, Medium, Low
  const order = ['High Priority', 'Medium Priority', 'Low Priority'];
  return order.filter(label => groups.has(label)).map(label => [label, groups.get(label)!]);
}

export default function TasksPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<TabFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupByOption>('stakeholder');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [pushing, setPushing] = useState(false);
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  const pushMenuRef = useRef<HTMLDivElement>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const tasks = useLiveQuery(() => taskRepository.getAll());

  // Load meetings and stakeholders for stakeholder grouping
  const meetings = useLiveQuery(() =>
    db.meetings.filter(m => m.deletedAt === null).toArray(),
  );
  const stakeholders = useLiveQuery(() =>
    db.stakeholders.filter(s => s.deletedAt === null).toArray(),
  );

  // Build meetingId → stakeholder names lookup
  const meetingStakeholderMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!meetings || !stakeholders) return map;
    const sMap = new Map(stakeholders.map(s => [s.id, s.name]));
    for (const m of meetings) {
      const names = m.stakeholderIds
        .map(sid => sMap.get(sid))
        .filter((n): n is string => !!n);
      map.set(m.id, names);
    }
    return map;
  }, [meetings, stakeholders]);

  // Count tasks that need pushing to TaskFlow
  const pendingPushCount = useMemo(() => {
    if (!tasks) return 0;
    return tasks.filter(
      (t) =>
        t.taskFlowSyncedAt === null ||
        t.taskFlowSyncedAt === undefined ||
        t.updatedAt > t.taskFlowSyncedAt,
    ).length;
  }, [tasks]);

  // Close push menu on outside click
  const closePushMenu = useCallback((e: MouseEvent) => {
    if (pushMenuRef.current && !pushMenuRef.current.contains(e.target as Node)) {
      setPushMenuOpen(false);
    }
  }, []);

  useEffect(() => {
    if (pushMenuOpen) {
      document.addEventListener('mousedown', closePushMenu);
      return () => document.removeEventListener('mousedown', closePushMenu);
    }
  }, [pushMenuOpen, closePushMenu]);

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

  // Sort tasks within groups: todo first, then by createdAt desc
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [filteredTasks]);

  // Group tasks
  const groupedTasks = useMemo(() => {
    switch (groupBy) {
      case 'deadline':
        return groupTasksByDeadline(sortedTasks);
      case 'priority':
        return groupTasksByPriority(sortedTasks);
      case 'stakeholder':
      default:
        return groupTasksByStakeholder(sortedTasks, meetingStakeholderMap);
    }
  }, [sortedTasks, groupBy, meetingStakeholderMap]);

  function toggleSection(label: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

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

  async function handlePushToTaskFlow(force?: boolean) {
    if (!tasks || tasks.length === 0) {
      addToast('No tasks to push', 'info');
      return;
    }
    if (!force && pendingPushCount === 0) {
      addToast('All tasks already synced', 'info');
      return;
    }
    setPushMenuOpen(false);
    setPushing(true);
    try {
      // Sync stakeholders/categories first so TF projects exist before tasks arrive
      // Non-fatal: push continues even if sync fails
      try { await syncStakeholdersToTaskFlow(force); } catch { /* sync is best-effort */ }
      const result = await pushConfirmedTasks(force);
      if (result.failed > 0) {
        addToast(`Pushed ${result.pushed} tasks, ${result.failed} failed`, 'error');
      } else if (force) {
        addToast(`Re-pushed all ${result.pushed} tasks to TaskFlow`, 'success');
      } else {
        addToast(`${result.pushed} new task${result.pushed === 1 ? '' : 's'} pushed to TaskFlow`, 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('Cloud sync not configured')) {
        addToast('Cloud sync not configured. Set URL and token in Settings.', 'warning');
      } else if (message.includes('SUPABASE_URL') || message.includes('SUPABASE_SERVICE_KEY')) {
        addToast('TaskFlow integration not configured on Worker. Set SUPABASE_URL and SUPABASE_SERVICE_KEY secrets.', 'error');
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
          <div className="relative" ref={pushMenuRef}>
            <div className="flex">
              <button
                onClick={() => handlePushToTaskFlow()}
                disabled={pushing || !navigator.onLine}
                className="flex items-center gap-1.5 rounded-l-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {pushing
                  ? 'Pushing...'
                  : pendingPushCount > 0
                    ? `Push to TaskFlow (${pendingPushCount})`
                    : 'All synced'}
              </button>
              <button
                onClick={() => setPushMenuOpen((v) => !v)}
                disabled={pushing || !navigator.onLine}
                className="flex items-center rounded-r-lg border-l border-brand-500 bg-brand-600 px-1.5 py-2 text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Push options"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {pushMenuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  onClick={() => handlePushToTaskFlow(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <RefreshCw size={14} />
                  Re-push All
                </button>
              </div>
            )}
          </div>
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

      {/* Group & Filter controls */}
      <div className="mb-4 flex items-center gap-2">
        <select
          value={groupBy}
          onChange={(e) => { setGroupBy(e.target.value as GroupByOption); setCollapsedSections(new Set()); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          aria-label="Group by"
        >
          <option value="stakeholder">Group: By Stakeholder</option>
          <option value="deadline">Group: By Due Date</option>
          <option value="priority">Group: By Priority</option>
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
        <div className="space-y-5">
          {groupedTasks.map(([label, sectionTasks]) => {
            const todoInSection = sectionTasks.filter(t => t.status === 'todo');
            const doneInSection = sectionTasks.filter(t => t.status === 'done');
            const isCollapsed = collapsedSections.has(label);

            return (
              <div key={label}>
                <button
                  onClick={() => toggleSection(label)}
                  className="mb-2.5 flex items-center gap-1 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  {label}
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    ({todoInSection.length} open{doneInSection.length > 0 ? `, ${doneInSection.length} done` : ''})
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2 pl-1">
                    {todoInSection.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDelete}
                      />
                    ))}
                    {doneInSection.length > 0 && todoInSection.length > 0 && (
                      <div className="my-2 border-t border-dashed border-gray-200 dark:border-gray-700" />
                    )}
                    {doneInSection.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
