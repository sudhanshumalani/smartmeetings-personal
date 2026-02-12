import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  Filter,
  Trash2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Search,
  CheckSquare,
  X,
  Sparkles,
} from 'lucide-react';
import { db } from '../../../db/database';
import type { Meeting, StakeholderCategory } from '../../../db/database';
import { meetingRepository } from '../../../services/meetingRepository';
import { meetingTemplateRepository } from '../../../services/meetingTemplateRepository';
import EmptyState from '../../../shared/components/EmptyState';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';
import { useToast } from '../../../contexts/ToastContext';
import MeetingCard from '../components/MeetingCard';
import SearchBar from '../components/SearchBar';
import FilterPanel, {
  emptyFilters,
  hasActiveFilters,
  type Filters,
} from '../components/FilterPanel';
import IntelligenceSearchBar from '../../search/components/IntelligenceSearchBar';
import IntelligenceResultCard from '../../search/components/IntelligenceResultCard';
import type { IntelligenceResult } from '../../../services/meetingIntelligenceService';

type SortOption = 'date' | 'title' | 'lastModified' | 'stakeholder';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDateSectionLabel(date: Date, now: Date): string {
  const startOfThisWeek = getStartOfWeek(now);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  if (date >= startOfThisWeek) return 'This Week';
  if (date >= startOfLastWeek) return 'Last Week';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupByDateSection(meetings: Meeting[]): [string, Meeting[]][] {
  const now = new Date();
  const groups = new Map<string, Meeting[]>();

  for (const meeting of meetings) {
    const label = getDateSectionLabel(meeting.date, now);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(meeting);
  }

  return [...groups.entries()];
}

function groupByStakeholder(
  meetings: Meeting[],
  stakeholderMap: Map<string, { name: string }>,
): [string, Meeting[]][] {
  const groups = new Map<string, Meeting[]>();

  for (const meeting of meetings) {
    const firstId = meeting.stakeholderIds[0];
    const label = firstId ? (stakeholderMap.get(firstId)?.name ?? 'Unknown') : 'No Stakeholder';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(meeting);
  }

  return [...groups.entries()];
}

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="skeleton h-5 w-3/4" />
      <div className="skeleton h-4 w-1/3" />
      <div className="flex gap-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

export default function MeetingListPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [filterOpen, setFilterOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // AI search state
  const [aiSearchMode, setAiSearchMode] = useState(false);
  const [aiResults, setAiResults] = useState<IntelligenceResult[] | null>(null);
  const [aiError, setAiError] = useState('');

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Reactive data from Dexie
  const meetings = useLiveQuery(
    () =>
      debouncedSearch
        ? meetingRepository.search(debouncedSearch)
        : meetingRepository.getAll(),
    [debouncedSearch],
  );

  const stakeholders = useLiveQuery(() =>
    db.stakeholders.filter((s) => s.deletedAt === null).toArray(),
  );

  const categories = useLiveQuery(() =>
    db.stakeholderCategories.filter((c) => c.deletedAt === null).toArray(),
  );

  const allTags = useLiveQuery(() => meetingRepository.getDistinctTags());

  const meetingTemplates = useLiveQuery(() => meetingTemplateRepository.getAll());

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Lookup maps
  const stakeholderMap = useMemo(
    () => new Map((stakeholders ?? []).map((s) => [s.id, s])),
    [stakeholders],
  );

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  // Apply client-side filters
  const filteredMeetings = useMemo(() => {
    if (!meetings) return [];

    return meetings.filter((m) => {
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(m.status)
      ) {
        return false;
      }

      if (filters.categoryIds.length > 0) {
        const meetingCatIds = new Set<string>();
        for (const sid of m.stakeholderIds) {
          const s = stakeholderMap.get(sid);
          if (s) s.categoryIds.forEach((cid) => meetingCatIds.add(cid));
        }
        if (!filters.categoryIds.some((cid) => meetingCatIds.has(cid))) {
          return false;
        }
      }

      if (filters.stakeholderIds.length > 0) {
        if (
          !filters.stakeholderIds.some((sid) =>
            m.stakeholderIds.includes(sid),
          )
        ) {
          return false;
        }
      }

      if (filters.tags.length > 0) {
        if (!filters.tags.some((t) => m.tags.includes(t))) return false;
      }

      if (filters.dateFrom) {
        if (m.date < new Date(filters.dateFrom)) return false;
      }

      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (m.date > toDate) return false;
      }

      return true;
    });
  }, [meetings, filters, stakeholderMap]);

  // Sort
  const sortedMeetings = useMemo(() => {
    return [...filteredMeetings].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return b.date.getTime() - a.date.getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'lastModified':
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        case 'stakeholder': {
          const nameA = a.stakeholderIds.length
            ? (stakeholderMap.get(a.stakeholderIds[0])?.name ?? '')
            : '';
          const nameB = b.stakeholderIds.length
            ? (stakeholderMap.get(b.stakeholderIds[0])?.name ?? '')
            : '';
          // Meetings without stakeholders go to the end
          if (!nameA && nameB) return 1;
          if (nameA && !nameB) return -1;
          return nameA.localeCompare(nameB);
        }
      }
    });
  }, [filteredMeetings, sortBy, stakeholderMap]);

  // Group by sections (date or stakeholder, not when searching)
  const groupedMeetings = useMemo(() => {
    if (debouncedSearch) return null;
    if (sortBy === 'date') return groupByDateSection(sortedMeetings);
    if (sortBy === 'stakeholder') return groupByStakeholder(sortedMeetings, stakeholderMap);
    return null;
  }, [sortedMeetings, debouncedSearch, sortBy, stakeholderMap]);

  // Get categories for a meeting
  function getMeetingCategories(meeting: Meeting): StakeholderCategory[] {
    const catIds = new Set<string>();
    for (const sid of meeting.stakeholderIds) {
      const s = stakeholderMap.get(sid);
      if (s) s.categoryIds.forEach((cid) => catIds.add(cid));
    }
    return [...catIds]
      .map((cid) => categoryMap.get(cid))
      .filter((c): c is StakeholderCategory => c !== undefined);
  }

  // Close new meeting menu on outside click
  useEffect(() => {
    if (!newMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [newMenuOpen]);

  async function handleNewMeeting() {
    setNewMenuOpen(false);
    const id = await meetingRepository.quickCreate();
    navigate(`/meetings/${id}`);
  }

  async function handleNewFromTemplate(templateId: string) {
    setNewMenuOpen(false);
    const template = await meetingTemplateRepository.getById(templateId);
    if (!template) return;
    const id = await meetingRepository.quickCreateFromTemplate(template);
    navigate(`/meetings/${id}`);
  }

  function toggleSection(label: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // Selection handlers
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(sortedMeetings.map((m) => m.id)));
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    await meetingRepository.softDeleteMany(ids);
    const count = ids.length;
    addToast(
      `${count} meeting${count !== 1 ? 's' : ''} moved to Trash`,
      'success',
      5000,
      {
        label: 'Undo',
        onClick: async () => {
          for (const id of ids) {
            await meetingRepository.restore(id);
          }
          addToast(`${count} meeting${count !== 1 ? 's' : ''} restored`, 'success');
        },
      },
    );
    setShowDeleteConfirm(false);
    exitSelectionMode();
  }

  const isLoading = meetings === undefined;
  const filtersActive = hasActiveFilters(filters);
  const noMeetingsAtAll =
    !isLoading &&
    !debouncedSearch &&
    !filtersActive &&
    sortedMeetings.length === 0;
  const noResults =
    !isLoading &&
    (!!debouncedSearch || filtersActive) &&
    sortedMeetings.length === 0;

  function renderCards(meetingsList: Meeting[], indexOffset = 0) {
    return meetingsList.map((meeting, i) => (
      <MeetingCard
        key={meeting.id}
        meeting={meeting}
        categories={getMeetingCategories(meeting)}
        selectionMode={selectionMode}
        selected={selectedIds.has(meeting.id)}
        onSelect={toggleSelect}
        index={indexOffset + i}
      />
    ));
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Dashboard
          </h1>
          <div className="flex items-center gap-2">
            {/* Selection mode toggle */}
            {!selectionMode ? (
              <button
                onClick={() => setSelectionMode(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <CheckSquare size={16} />
                <span className="hidden sm:inline">Select</span>
              </button>
            ) : (
              <button
                onClick={exitSelectionMode}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X size={16} />
                <span className="hidden sm:inline">Cancel</span>
              </button>
            )}

            <Link
              to="/trash"
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Trash</span>
            </Link>
            <div className="relative" ref={newMenuRef}>
              <button
                onClick={() => {
                  if (meetingTemplates && meetingTemplates.length > 0) {
                    setNewMenuOpen(!newMenuOpen);
                  } else {
                    handleNewMeeting();
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
              >
                <Plus size={16} />
                New Meeting
                {meetingTemplates && meetingTemplates.length > 0 && (
                  <ChevronDown size={14} className={`transition-transform ${newMenuOpen ? 'rotate-180' : ''}`} />
                )}
              </button>
              {newMenuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  <button
                    onClick={handleNewMeeting}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Plus size={14} />
                    Blank Meeting
                  </button>
                  <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />
                  {(meetingTemplates ?? []).map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleNewFromTemplate(t.id)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selection action bar */}
        {selectionMode && selectedIds.size > 0 && (
          <div className="animate-slide-down flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 dark:border-brand-800 dark:bg-brand-900/20">
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {selectedIds.size} selected
            </span>
            <button
              onClick={selectAll}
              className="text-sm text-brand-600 hover:underline dark:text-brand-400"
            >
              Select All
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Trash2 size={14} />
              Delete Selected
            </button>
          </div>
        )}

        {/* Search + Filter + Sort row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2">
            {aiSearchMode ? (
              <div className="flex-1">
                <IntelligenceSearchBar
                  onResults={(results) => setAiResults(results)}
                  onClear={() => setAiResults(null)}
                  onError={(err) => setAiError(err)}
                />
              </div>
            ) : (
              <div className="flex-1">
                <SearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>
            )}
            <button
              onClick={() => {
                setAiSearchMode(!aiSearchMode);
                setAiResults(null);
                setAiError('');
                setSearchQuery('');
              }}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                aiSearchMode
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
              title={aiSearchMode ? 'Switch to simple search' : 'Switch to AI search'}
            >
              <Sparkles size={16} />
              <span className="hidden sm:inline">AI</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                filtersActive
                  ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              <Filter size={16} />
              Filter
              {filtersActive && (
                <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">
                  {filters.statuses.length +
                    filters.categoryIds.length +
                    filters.stakeholderIds.length +
                    filters.tags.length +
                    (filters.dateFrom ? 1 : 0) +
                    (filters.dateTo ? 1 : 0)}
                </span>
              )}
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              aria-label="Sort by"
            >
              <option value="date">Sort by Date</option>
              <option value="title">Sort by Title</option>
              <option value="lastModified">Sort by Last Modified</option>
              <option value="stakeholder">Sort by Stakeholder</option>
            </select>
          </div>
        </div>

        {/* Filter Panel */}
        {filterOpen && (
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            categories={categories ?? []}
            stakeholders={stakeholders ?? []}
            allTags={allTags ?? []}
          />
        )}
      </div>

      {/* AI Search Results */}
      {aiSearchMode && aiError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {aiError}
        </div>
      )}

      {aiSearchMode && aiResults !== null ? (
        aiResults.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={48} />}
            title="No matching meetings"
            description="Try a different query or broaden your search."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aiResults.map(result => (
              <IntelligenceResultCard key={result.meeting.id} result={result} />
            ))}
          </div>
        )
      ) : /* Content */
      isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : noMeetingsAtAll ? (
        <EmptyState
          icon={<ClipboardList size={48} />}
          title="No meetings yet"
          description="Create your first meeting to get started. Don't forget to set up your API keys in Settings."
          action={
            <button
              onClick={handleNewMeeting}
              className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
            >
              Create your first meeting
            </button>
          }
        />
      ) : noResults ? (
        <EmptyState
          icon={<Search size={48} />}
          title="No results found"
          description="Try adjusting your search or filters."
        />
      ) : !groupedMeetings ? (
        /* Flat list: search results or non-date sort */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {renderCards(sortedMeetings)}
        </div>
      ) : (
        /* Grouped by date section */
        <div className="space-y-6">
          {groupedMeetings?.map(([label, sectionMeetings]) => (
            <div key={label}>
              <button
                onClick={() => toggleSection(label)}
                className="mb-3 flex items-center gap-1 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {collapsedSections.has(label) ? (
                  <ChevronRight size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
                {label}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  ({sectionMeetings.length})
                </span>
              </button>
              {!collapsedSections.has(label) && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {renderCards(sectionMeetings)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bulk delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Move to Trash"
        message={`Move ${selectedIds.size} meeting${selectedIds.size !== 1 ? 's' : ''} to Trash? You can restore them later.`}
        confirmLabel="Move to Trash"
        cancelLabel="Cancel"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
