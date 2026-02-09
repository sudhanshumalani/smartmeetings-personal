import type { MeetingStatus, Stakeholder, StakeholderCategory } from '../../../db/database';

export interface Filters {
  statuses: MeetingStatus[];
  stakeholderIds: string[];
  categoryIds: string[];
  tags: string[];
  dateFrom: string;
  dateTo: string;
}

export const emptyFilters: Filters = {
  statuses: [],
  stakeholderIds: [],
  categoryIds: [],
  tags: [],
  dateFrom: '',
  dateTo: '',
};

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.stakeholderIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.tags.length > 0 ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''
  );
}

interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: StakeholderCategory[];
  stakeholders: Stakeholder[];
  allTags: string[];
}

export default function FilterPanel({
  filters,
  onChange,
  categories,
  stakeholders,
  allTags,
}: FilterPanelProps) {
  const statuses: { value: MeetingStatus; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ];

  function toggleStatus(status: MeetingStatus) {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next });
  }

  function toggleStakeholder(id: string) {
    const next = filters.stakeholderIds.includes(id)
      ? filters.stakeholderIds.filter((s) => s !== id)
      : [...filters.stakeholderIds, id];
    onChange({ ...filters, stakeholderIds: next });
  }

  function toggleCategory(id: string) {
    const next = filters.categoryIds.includes(id)
      ? filters.categoryIds.filter((c) => c !== id)
      : [...filters.categoryIds, id];
    onChange({ ...filters, categoryIds: next });
  }

  function toggleTag(tag: string) {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    onChange({ ...filters, tags: next });
  }

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
      data-testid="filter-panel"
    >
      <div className="flex flex-wrap gap-6">
        {/* Status */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Status
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => toggleStatus(s.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filters.statuses.includes(s.value)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Category
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filters.categoryIds.includes(c.id)
                      ? 'text-white'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: filters.categoryIds.includes(c.id)
                      ? c.color
                      : `${c.color}33`,
                    color: filters.categoryIds.includes(c.id) ? 'white' : c.color,
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stakeholders */}
        {stakeholders.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Stakeholder
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {stakeholders.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleStakeholder(s.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filters.stakeholderIds.includes(s.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {allTags.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filters.tags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date Range */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Date Range
          </h4>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
              className="rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              aria-label="Date from"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
              className="rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              aria-label="Date to"
            />
          </div>
        </div>
      </div>

      {hasActiveFilters(filters) && (
        <button
          onClick={() => onChange(emptyFilters)}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
