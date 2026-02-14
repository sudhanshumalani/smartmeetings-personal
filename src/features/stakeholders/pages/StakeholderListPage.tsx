import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Users, Tags, CheckCircle, CloudUpload, Send, Loader2 } from 'lucide-react';
import type { StakeholderCategory } from '../../../db/database';
import { stakeholderRepository } from '../../../services/stakeholderRepository';
import { categoryRepository } from '../../../services/categoryRepository';
import { syncStakeholdersToTaskFlow, verifyTaskFlowSync } from '../../../services/taskFlowService';
import { useToast } from '../../../contexts/ToastContext';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import EmptyState from '../../../shared/components/EmptyState';
import CategoryBadge from '../components/CategoryBadge';
import CategoryManager from '../components/CategoryManager';
import StakeholderForm from '../components/StakeholderForm';

export default function StakeholderListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string | ''>('');
  const [formOpen, setFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'stakeholders' | 'categories'>('stakeholders');
  const [syncing, setSyncing] = useState(false);

  const stakeholders = useLiveQuery(() => stakeholderRepository.getAll());
  const categories = useLiveQuery(() => categoryRepository.getAll());

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const filtered = useMemo(() => {
    if (!stakeholders) return [];

    let result = stakeholders;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.organization?.toLowerCase().includes(q) ?? false),
      );
    }

    // Category filter
    if (filterCategoryId) {
      result = result.filter((s) =>
        s.categoryIds.includes(filterCategoryId),
      );
    }

    return result;
  }, [stakeholders, searchQuery, filterCategoryId]);

  function getStakeholderCategories(categoryIds: string[]): StakeholderCategory[] {
    return categoryIds
      .map((id) => categoryMap.get(id))
      .filter((c): c is StakeholderCategory => c !== undefined);
  }

  const pendingSyncCount = useMemo(() => {
    const pendingStakeholders = (stakeholders ?? []).filter(
      (s) => s.taskFlowSyncedAt === null || s.taskFlowSyncedAt === undefined || s.updatedAt > s.taskFlowSyncedAt,
    ).length;
    const pendingCategories = (categories ?? []).filter(
      (c) => c.taskFlowSyncedAt === null || c.taskFlowSyncedAt === undefined || c.updatedAt > c.taskFlowSyncedAt,
    ).length;
    return pendingStakeholders + pendingCategories;
  }, [stakeholders, categories]);

  async function handleSyncToTaskFlow() {
    if (pendingSyncCount === 0) {
      addToast('All stakeholders and categories already synced', 'info');
      return;
    }
    setSyncing(true);
    try {
      const result = await syncStakeholdersToTaskFlow();
      if (result.errors.length > 0) {
        addToast(`Sync completed with errors: ${result.errors.join(', ')}`, 'error');
      } else {
        const parts: string[] = [];
        if (result.projectsUpserted > 0) parts.push(`${result.projectsUpserted} stakeholder${result.projectsUpserted === 1 ? '' : 's'}`);
        if (result.categoriesSynced > 0) parts.push(`${result.categoriesSynced} ${result.categoriesSynced === 1 ? 'category' : 'categories'}`);
        addToast(`Synced ${parts.join(' and ')} to TaskFlow`, 'success');
      }
      const mismatch = await verifyTaskFlowSync();
      if (mismatch) {
        addToast(mismatch, 'warning', 8000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('Cloud sync not configured')) {
        addToast('Cloud sync not configured. Set URL and token in Settings.', 'warning');
      } else {
        addToast(`Sync failed: ${message}`, 'error');
      }
    } finally {
      setSyncing(false);
    }
  }

  const isLoading = stakeholders === undefined;
  const noStakeholders = !isLoading && !searchQuery && !filterCategoryId && filtered.length === 0;
  const noResults = !isLoading && (!!searchQuery || !!filterCategoryId) && filtered.length === 0;

  const tabs = [
    { key: 'stakeholders' as const, label: 'Stakeholders', icon: Users },
    { key: 'categories' as const, label: 'Categories', icon: Tags },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Stakeholders
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncToTaskFlow}
            disabled={syncing || !navigator.onLine}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {syncing
              ? 'Syncing...'
              : pendingSyncCount > 0
                ? `Sync to TaskFlow (${pendingSyncCount})`
                : 'All synced'}
          </button>
          {activeTab === 'stakeholders' && !isMobile && (
            <button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={16} />
              Add Stakeholder
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stakeholders Tab */}
      {activeTab === 'stakeholders' && (
        <>
          {/* Search + Category Filter */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or organization..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              aria-label="Filter by category"
            >
              <option value="">All Categories</option>
              {(categories ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="py-16 text-center text-gray-400">Loading...</div>
          ) : noStakeholders ? (
            <EmptyState
              icon={<Users size={48} />}
              title="No stakeholders yet"
              description="Add your first stakeholder to start tracking contacts and relationships."
              action={
                <button
                  onClick={() => setFormOpen(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Add your first stakeholder
                </button>
              }
            />
          ) : noResults ? (
            <EmptyState
              icon={<Search size={48} />}
              title="No results found"
              description="Try adjusting your search or filter."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => {
                const cats = getStakeholderCategories(s.categoryIds);
                const synced =
                  s.taskFlowSyncedAt !== null &&
                  s.taskFlowSyncedAt !== undefined &&
                  s.updatedAt <= s.taskFlowSyncedAt;
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/stakeholders/${s.id}`)}
                    className="flex w-full flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-medium text-gray-900 dark:text-gray-100">
                        {s.name}
                      </h3>
                      {synced ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400" title="Synced to TaskFlow">
                          <CheckCircle size={10} />
                          Synced
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" title="Pending push to TaskFlow">
                          <CloudUpload size={10} />
                          Pending
                        </span>
                      )}
                    </div>
                    {s.organization && (
                      <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                        {s.organization}
                      </p>
                    )}
                    {s.email && (
                      <p className="truncate text-sm text-gray-400 dark:text-gray-500">
                        {s.email}
                      </p>
                    )}
                    {cats.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {cats.map((cat) => (
                          <CategoryBadge
                            key={cat.id}
                            name={cat.name}
                            color={cat.color}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
          <CategoryManager />
        </div>
      )}

      {/* StakeholderForm Modal */}
      <StakeholderForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
