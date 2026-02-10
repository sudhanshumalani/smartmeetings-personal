import { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import { db } from '../../../db/database';
import type { Meeting, StakeholderCategory } from '../../../db/database';
import { meetingRepository } from '../../../services/meetingRepository';
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

type SortOption = 'date' | 'title' | 'lastModified';

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
      }
    });
  }, [filteredMeetings, sortBy]);

  // Group by date sections (only when not searching)
  const groupedMeetings = useMemo(() => {
    if (debouncedSearch) return null;
    return groupByDateSection(sortedMeetings);
  }, [sortedMeetings, debouncedSearch]);

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

  async function handleNewMeeting() {
    const id = await meetingRepository.quickCreate();
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
    addToast(
      `${ids.length} meeting${ids.length !== 1 ? 's' : ''} moved to Trash`,
      'success',
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
            <button
              onClick={handleNewMeeting}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
            >
              <Plus size={16} />
              New Meeting
            </button>
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
          <div className="flex-1">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
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

      {/* Content */}
      {isLoading ? (
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
      ) : debouncedSearch ? (
        /* Search results: flat list */
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
